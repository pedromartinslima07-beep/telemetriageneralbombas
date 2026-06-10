package com.generalbombas.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.location.Location;
import android.os.Binder;
import android.os.Build;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.IBinder;
import android.os.Looper;

import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationCallback;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationResult;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;

/**
 * ForegroundService que coleta GPS via FusedLocationProviderClient e envia
 * HTTP POST para /tecnicos/localizacao diretamente do Java — sem passar pelo
 * WebView, que o Android pausa com a tela apagada.
 */
public class NativeGpsService extends Service {

    static final String CHANNEL_ID  = "com.generalbombas.app.native_gps";
    static final int    NOTIF_ID    = 28353;
    static final String ACTION_LOC  = "com.generalbombas.app.NATIVE_GPS_UPDATE";

    private final IBinder binder = new LocalBinder();

    private FusedLocationProviderClient locationClient;
    private LocationCallback            locationCallback;
    private HandlerThread               httpThread;
    private Handler                     httpHandler;

    private volatile String endpoint;
    private volatile String token;
    private volatile long   intervalMs = 60_000L;
    private volatile long   lastSentTs = 0L;

    // ── Binder ────────────────────────────────────────────────────────────
    public class LocalBinder extends Binder {
        void configure(String ep, String tk, long intMs,
                       String notifTitle, String notifMessage) {
            NativeGpsService.this.endpoint   = ep;
            NativeGpsService.this.token      = tk;
            NativeGpsService.this.intervalMs = intMs > 0 ? intMs : 60_000L;
            NativeGpsService.this.lastSentTs = 0L;
            startForeground(NOTIF_ID, buildNotification(notifTitle, notifMessage));
            startLocationUpdates();
        }
        void updateToken(String newToken) { NativeGpsService.this.token = newToken; }
        void stop() { NativeGpsService.this.stopTracking(); }
    }

    // ── Lifecycle ─────────────────────────────────────────────────────────
    @Override
    public IBinder onBind(Intent intent) { return binder; }

    @Override
    public void onCreate() {
        super.onCreate();
        locationClient = LocationServices.getFusedLocationProviderClient(this);
        httpThread = new HandlerThread("NativeGpsHttp");
        httpThread.start();
        httpHandler = new Handler(httpThread.getLooper());
        createNotificationChannel();
    }

    @Override
    public boolean onUnbind(Intent intent) {
        stopTracking();
        stopSelf();
        return false;
    }

    @Override
    public void onDestroy() {
        stopTracking();
        httpThread.quitSafely();
        super.onDestroy();
    }

    // ── GPS ──────────────────────────────────────────────────────────────
    private void startLocationUpdates() {
        if (locationCallback != null) {
            locationClient.removeLocationUpdates(locationCallback);
        }
        locationCallback = new LocationCallback() {
            @Override
            public void onLocationResult(LocationResult result) {
                Location loc = result.getLastLocation();
                if (loc == null) return;

                // Broadcast para o JS atualizar a UI (best-effort quando tela ligada)
                Intent broadcast = new Intent(ACTION_LOC);
                broadcast.putExtra("location", loc);
                sendBroadcast(broadcast);

                // POST em background thread, respeitando o intervalo configurado
                long now = System.currentTimeMillis();
                if (now - lastSentTs >= intervalMs) {
                    lastSentTs = now;
                    final Location copy = loc;
                    httpHandler.post(() -> postLocation(copy));
                }
            }
        };

        LocationRequest req = new LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 5_000L)
                .setMinUpdateIntervalMillis(3_000L)
                .setMaxUpdateDelayMillis(15_000L)
                .build();

        try {
            locationClient.requestLocationUpdates(req, locationCallback, Looper.getMainLooper());
        } catch (SecurityException ignored) {}
    }

    private void stopTracking() {
        if (locationCallback != null) {
            locationClient.removeLocationUpdates(locationCallback);
            locationCallback = null;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(STOP_FOREGROUND_REMOVE);
        } else {
            stopForeground(true);
        }
    }

    // ── HTTP POST ────────────────────────────────────────────────────────
    private void postLocation(Location loc) {
        if (endpoint == null || token == null) return;
        try {
            SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
            sdf.setTimeZone(TimeZone.getTimeZone("UTC"));
            String capturadaEm = sdf.format(new Date(loc.getTime()));

            String json = "{"
                    + "\"lat\":"          + loc.getLatitude()  + ","
                    + "\"lng\":"          + loc.getLongitude() + ","
                    + "\"precisao_m\":"   + loc.getAccuracy()  + ","
                    + "\"capturada_em\":\"" + capturadaEm      + "\""
                    + "}";

            byte[] body = json.getBytes(StandardCharsets.UTF_8);

            URL url = new URL(endpoint);
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("POST");
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty("Authorization", "Bearer " + token);
            conn.setDoOutput(true);
            conn.setFixedLengthStreamingMode(body.length);
            conn.setConnectTimeout(10_000);
            conn.setReadTimeout(10_000);

            try (OutputStream os = conn.getOutputStream()) {
                os.write(body);
            }
            // Lê e descarta a resposta para liberar a conexão
            try { conn.getInputStream().close(); } catch (Exception ignored) {}
            conn.disconnect();
        } catch (Exception ignored) {}
    }

    // ── Notificação ──────────────────────────────────────────────────────
    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel ch = new NotificationChannel(
                    CHANNEL_ID, "GPS Tracking", NotificationManager.IMPORTANCE_LOW);
            ch.setSound(null, null);
            ch.enableVibration(false);
            getSystemService(NotificationManager.class).createNotificationChannel(ch);
        }
    }

    private Notification buildNotification(String title, String message) {
        Intent launch = getPackageManager().getLaunchIntentForPackage(getPackageName());
        PendingIntent pi = launch != null
                ? PendingIntent.getActivity(this, 0, launch,
                        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE)
                : null;

        Notification.Builder builder = new Notification.Builder(this, CHANNEL_ID)
                .setContentTitle(title   != null ? title   : "GPS ativo")
                .setContentText(message  != null ? message : "Rastreando localização")
                .setSmallIcon(R.mipmap.ic_launcher)
                .setOngoing(true)
                .setOnlyAlertOnce(true);
        if (pi != null) builder.setContentIntent(pi);
        return builder.build();
    }
}
