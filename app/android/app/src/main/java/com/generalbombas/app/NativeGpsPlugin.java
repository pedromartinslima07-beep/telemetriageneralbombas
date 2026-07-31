package com.generalbombas.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.location.Location;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Plugin Capacitor que expõe NativeGpsService ao JavaScript.
 *
 * JS API:
 *   NativeGpsTracker.start({ endpoint, token, intervalMs, notificationTitle, notificationMessage })
 *   NativeGpsTracker.stop()
 *   NativeGpsTracker.addListener('locationUpdate', callback)
 *
 * O serviço é *started* (startForegroundService), não bound: ele precisa
 * sobreviver à Activity ser destruída com a tela apagada. Por isso este plugin
 * não guarda referência ao serviço e não o desliga quando a Activity morre —
 * só o `stop()` explícito do JS (logout / fora da janela de horário) para o
 * rastreamento. Ver o comentário no topo de NativeGpsService.
 */
@CapacitorPlugin(name = "NativeGpsTracker")
public class NativeGpsPlugin extends Plugin {

    private BroadcastReceiver locationReceiver = null;

    // ── Capacitor lifecycle ───────────────────────────────────────────────
    @Override
    public void load() {
        super.load();
        registerLocationReceiver();
    }

    @Override
    protected void handleOnDestroy() {
        // Só o receiver de UI é desfeito. O serviço de GPS continua rodando de
        // propósito — era exatamente o `service.stop()` daqui que derrubava o
        // rastreamento quando o Android reciclava a Activity.
        unregisterLocationReceiver();
        super.handleOnDestroy();
    }

    // ── Plugin methods ────────────────────────────────────────────────────
    @PluginMethod
    public void start(PluginCall call) {
        try {
            Intent i = new Intent(getContext(), NativeGpsService.class);
            i.setAction(NativeGpsService.ACTION_START);
            i.putExtra(NativeGpsService.EXTRA_ENDPOINT,  call.getString("endpoint", ""));
            i.putExtra(NativeGpsService.EXTRA_TOKEN,     call.getString("token", ""));
            i.putExtra(NativeGpsService.EXTRA_INTERVAL,  call.getLong("intervalMs", 60_000L));
            // Janela de expediente: o serviço precisa dela pra se policiar
            // sozinho quando a WebView estiver congelada.
            i.putExtra(NativeGpsService.EXTRA_EXP_INI,   call.getInt("expedienteInicio", 8));
            i.putExtra(NativeGpsService.EXTRA_EXP_FIM,   call.getInt("expedienteFim", 18));
            i.putExtra(NativeGpsService.EXTRA_NOTIF_TIT, call.getString("notificationTitle", "GPS ativo"));
            i.putExtra(NativeGpsService.EXTRA_NOTIF_MSG, call.getString("notificationMessage",
                    "General Bombas está monitorando sua localização."));
            iniciar(i);
            call.resolve();
        } catch (Exception e) {
            call.reject("Erro ao iniciar GPS: " + e.getMessage());
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        try {
            Intent i = new Intent(getContext(), NativeGpsService.class);
            i.setAction(NativeGpsService.ACTION_STOP);
            // stop nunca usa startForegroundService: o serviço vai justamente
            // sair do foreground e se encerrar.
            getContext().startService(i);
        } catch (Exception ignored) {}
        call.resolve();
    }

    @PluginMethod
    public void updateToken(PluginCall call) {
        try {
            Intent i = new Intent(getContext(), NativeGpsService.class);
            i.setAction(NativeGpsService.ACTION_UPDATE_TOKEN);
            i.putExtra(NativeGpsService.EXTRA_TOKEN, call.getString("token", ""));
            iniciar(i);
        } catch (Exception ignored) {}
        call.resolve();
    }

    @PluginMethod
    public void requestBatteryExemption(PluginCall call) {
        try {
            PowerManager pm = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
            if (pm != null && !pm.isIgnoringBatteryOptimizations(getContext().getPackageName())) {
                Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                intent.setData(Uri.parse("package:" + getContext().getPackageName()));
                getActivity().startActivity(intent);
            }
        } catch (Exception ignored) {
            // Alguns ROMs (MIUI, OneUI) não suportam esse intent — ignora silenciosamente.
        }
        call.resolve();
    }

    private void iniciar(Intent i) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            getContext().startForegroundService(i);
        } else {
            getContext().startService(i);
        }
    }

    // ── Location broadcast → JS event ────────────────────────────────────
    private void registerLocationReceiver() {
        locationReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                Location loc = intent.getParcelableExtra("location");
                if (loc == null) return;
                JSObject data = new JSObject();
                data.put("lat",      loc.getLatitude());
                data.put("lng",      loc.getLongitude());
                data.put("accuracy", loc.getAccuracy());
                data.put("time",     loc.getTime());
                notifyListeners("locationUpdate", data);
            }
        };

        IntentFilter filter = new IntentFilter(NativeGpsService.ACTION_LOC);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            getContext().registerReceiver(locationReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            getContext().registerReceiver(locationReceiver, filter);
        }
    }

    private void unregisterLocationReceiver() {
        if (locationReceiver != null) {
            try { getContext().unregisterReceiver(locationReceiver); } catch (Exception ignored) {}
            locationReceiver = null;
        }
    }
}
