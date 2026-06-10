package com.generalbombas.app;

import android.content.BroadcastReceiver;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.ServiceConnection;
import android.location.Location;
import android.net.Uri;
import android.os.Build;
import android.os.IBinder;
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
 */
@CapacitorPlugin(name = "NativeGpsTracker")
public class NativeGpsPlugin extends Plugin {

    private NativeGpsService.LocalBinder service = null;
    private BroadcastReceiver locationReceiver   = null;

    // ── Capacitor lifecycle ───────────────────────────────────────────────
    @Override
    public void load() {
        super.load();
        bindToService();
        registerLocationReceiver();
    }

    @Override
    protected void handleOnDestroy() {
        unregisterLocationReceiver();
        if (service != null) service.stop();
        super.handleOnDestroy();
    }

    // ── Plugin methods ────────────────────────────────────────────────────
    @PluginMethod
    public void start(PluginCall call) {
        if (service == null) {
            call.reject("Service not bound yet.");
            return;
        }
        String endpoint      = call.getString("endpoint", "");
        String token         = call.getString("token", "");
        long   intervalMs    = call.getLong("intervalMs", 60_000L);
        String notifTitle    = call.getString("notificationTitle", "GPS ativo");
        String notifMessage  = call.getString("notificationMessage",
                "General Bombas está monitorando sua localização.");

        service.configure(endpoint, token, intervalMs, notifTitle, notifMessage);
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        if (service != null) service.stop();
        call.resolve();
    }

    @PluginMethod
    public void updateToken(PluginCall call) {
        if (service != null) service.updateToken(call.getString("token", ""));
        call.resolve();
    }

    @PluginMethod
    public void requestBatteryExemption(PluginCall call) {
        PowerManager pm = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
        if (pm != null && !pm.isIgnoringBatteryOptimizations(getContext().getPackageName())) {
            Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
            intent.setData(Uri.parse("package:" + getContext().getPackageName()));
            getActivity().startActivity(intent);
        }
        call.resolve();
    }

    // ── Service binding ───────────────────────────────────────────────────
    private void bindToService() {
        Intent intent = new Intent(getContext(), NativeGpsService.class);
        getContext().bindService(intent, new ServiceConnection() {
            @Override
            public void onServiceConnected(ComponentName name, IBinder binder) {
                service = (NativeGpsService.LocalBinder) binder;
            }
            @Override
            public void onServiceDisconnected(ComponentName name) {
                service = null;
            }
        }, Context.BIND_AUTO_CREATE);
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
