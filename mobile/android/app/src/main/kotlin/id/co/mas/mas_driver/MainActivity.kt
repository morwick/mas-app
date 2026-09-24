package id.co.mas.mas_driver

import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import android.os.Bundle
import io.flutter.embedding.android.FlutterActivity

class MainActivity : FlutterActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        createNotificationChannel()
    }

    // Channel yang dirujuk meta-data default_notification_channel_id di manifest.
    // Sejak Android 8 notifikasi dengan channel tak dikenal dibuang diam-diam,
    // jadi channel harus ada sebelum push pertama tiba. Aman dilakukan di sini:
    // driver wajib membuka app untuk login, dan di situlah token FCM didaftarkan.
    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val channel = NotificationChannel(
            getString(R.string.default_notification_channel_id),
            getString(R.string.default_notification_channel_name),
            NotificationManager.IMPORTANCE_HIGH,
        )
        channel.description = getString(R.string.default_notification_channel_description)
        getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }
}
