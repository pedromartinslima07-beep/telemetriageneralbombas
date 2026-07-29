package com.generalbombas.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.location.Location;
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
 *
 * IMPORTANTE — este é um *started service*, não um bound service.
 *
 * A primeira versão era só `bindService(BIND_AUTO_CREATE)`: o ciclo de vida
 * ficava preso à Activity, então quando o Android destruía a Activity com a
 * tela apagada (Doze / gerenciador de bateria do fabricante) o serviço morria
 * junto e o rastreamento parava silenciosamente — a notificação sumia da barra.
 * Chamar `startForeground()` num serviço apenas-bound NÃO resolve: ele continua
 * morrendo quando o último cliente desbinda.
 *
 * Agora tudo entra por `startForegroundService()` + `onStartCommand`, que
 * devolve START_STICKY para o sistema recriar o serviço se matar o processo.
 * Como o Android recria com Intent nulo, a config (endpoint/token/intervalo)
 * fica em SharedPreferences — sem isso o serviço voltaria sem token e não
 * mandaria nada.
 */
public class NativeGpsService extends Service {

    private static final String TAG = "NativeGps";

    static final String CHANNEL_ID  = "com.generalbombas.app.native_gps";
    static final int    NOTIF_ID    = 28353;
    static final String ACTION_LOC  = "com.generalbombas.app.NATIVE_GPS_UPDATE";

    // Ações aceitas via Intent
    static final String ACTION_START        = "com.generalbombas.app.GPS_START";
    static final String ACTION_STOP         = "com.generalbombas.app.GPS_STOP";
    static final String ACTION_UPDATE_TOKEN = "com.generalbombas.app.GPS_UPDATE_TOKEN";

    static final String EXTRA_ENDPOINT   = "endpoint";
    static final String EXTRA_TOKEN      = "token";
    static final String EXTRA_INTERVAL   = "intervalMs";
    static final String EXTRA_NOTIF_TIT  = "notificationTitle";
    static final String EXTRA_NOTIF_MSG  = "notificationMessage";

    private static final String PREFS = "native_gps_prefs";

    private FusedLocationProviderClient locationClient;
    private LocationCallback            locationCallback;
    private HandlerThread               httpThread;
    private Handler                     httpHandler;

    private volatile String endpoint;
    private volatile String token;
    private volatile long   intervalMs = 60_000L;
    private volatile long   lastSentTs = 0L;

    private String notifTitle   = "GPS ativo";
    private String notifMessage = "General Bombas está monitorando sua localização.";

    // ── Lifecycle ─────────────────────────────────────────────────────────
    // Started service: nada de binder. O JS conversa por Intent e recebe as
    // posições pelo broadcast ACTION_LOC.
    @Override
    public IBinder onBind(Intent intent) { return null; }

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
    public int onStartCommand(Intent intent, int flags, int startId) {
        final String action = intent != null ? intent.getAction() : null;

        if (ACTION_STOP.equals(action)) {
            limparConfig();
            stopTracking();
            stopSelf();
            return START_NOT_STICKY;
        }

        if (ACTION_UPDATE_TOKEN.equals(action)) {
            String novo = intent.getStringExtra(EXTRA_TOKEN);
            if (novo != null && !novo.isEmpty()) {
                this.token = novo;
                salvarToken(novo);
            }
            return START_STICKY;
        }

        if (ACTION_START.equals(action)) {
            this.endpoint     = intent.getStringExtra(EXTRA_ENDPOINT);
            this.token        = intent.getStringExtra(EXTRA_TOKEN);
            long inter        = intent.getLongExtra(EXTRA_INTERVAL, 60_000L);
            this.intervalMs   = inter > 0 ? inter : 60_000L;
            this.lastSentTs   = 0L;
            String t = intent.getStringExtra(EXTRA_NOTIF_TIT);
            String m = intent.getStringExtra(EXTRA_NOTIF_MSG);
            if (t != null) notifTitle   = t;
            if (m != null) notifMessage = m;
            salvarConfig();
        } else {
            // intent == null → o sistema recriou o serviço (START_STICKY).
            // Restaura a última config conhecida; sem ela não há o que fazer.
            if (!carregarConfig()) {
                stopSelf();
                return START_NOT_STICKY;
            }
            android.util.Log.i(TAG, "servico recriado pelo sistema, config restaurada");
        }

        subirParaForeground();
        startLocationUpdates();
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        stopTracking();
        httpThread.quitSafely();
        super.onDestroy();
    }

    /**
     * O Android 14+ exige que um serviço iniciado com startForegroundService()
     * chame startForeground() em até ~5s, declarando o tipo. Falhar aqui
     * derruba o app com ForegroundServiceDidNotStartInTimeException.
     */
    private void subirParaForeground() {
        try {
            Notification n = buildNotification(notifTitle, notifMessage);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(NOTIF_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
            } else {
                startForeground(NOTIF_ID, n);
            }
        } catch (Exception e) {
            android.util.Log.w(TAG, "startForeground falhou: " + e.getMessage());
        }
    }

    // ── Config persistida ────────────────────────────────────────────────
    private SharedPreferences prefs() {
        return getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private void salvarConfig() {
        prefs().edit()
                .putString(EXTRA_ENDPOINT, endpoint)
                .putString(EXTRA_TOKEN, token)
                .putLong(EXTRA_INTERVAL, intervalMs)
                .putString(EXTRA_NOTIF_TIT, notifTitle)
                .putString(EXTRA_NOTIF_MSG, notifMessage)
                .apply();
    }

    private void salvarToken(String novo) {
        prefs().edit().putString(EXTRA_TOKEN, novo).apply();
    }

    private void limparConfig() {
        prefs().edit().clear().apply();
    }

    /** @return true se havia config utilizável (endpoint + token). */
    private boolean carregarConfig() {
        SharedPreferences p = prefs();
        endpoint     = p.getString(EXTRA_ENDPOINT, null);
        token        = p.getString(EXTRA_TOKEN, null);
        intervalMs   = p.getLong(EXTRA_INTERVAL, 60_000L);
        notifTitle   = p.getString(EXTRA_NOTIF_TIT, notifTitle);
        notifMessage = p.getString(EXTRA_NOTIF_MSG, notifMessage);
        lastSentTs   = 0L;
        return endpoint != null && !endpoint.isEmpty()
                && token != null && !token.isEmpty();
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
                broadcast.setPackage(getPackageName());
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
        } catch (SecurityException e) {
            android.util.Log.w(TAG, "sem permissao de localizacao: " + e.getMessage());
        }
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
        HttpURLConnection conn = null;
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
            conn = (HttpURLConnection) url.openConnection();
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
            int code = conn.getResponseCode();
            // Sem log, uma falha de rede/401 some sem deixar rastro e o pin
            // congela no mapa sem ninguém saber por quê.
            if (code < 200 || code >= 300) {
                android.util.Log.w(TAG, "POST localizacao respondeu HTTP " + code);
            }
            try { conn.getInputStream().close(); } catch (Exception ignored) {}
        } catch (Exception e) {
            android.util.Log.w(TAG, "POST localizacao falhou: " + e);
        } finally {
            if (conn != null) conn.disconnect();
        }
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
