package com.rastriyabanijyabank.kyc.screencapture

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import org.webrtc.*

/**
 * Android Native Screen Capture Service
 * Implements MediaProjection API with Foreground Service requirements
 * Complies with Section 2, Section 8, and Section 14 of Technical Specification
 */
class ScreenCaptureService : Service() {

    companion object {
        const val ACTION_START = "com.rastriyabanijyabank.kyc.START_SCREEN_CAPTURE"
        const val ACTION_STOP = "com.rastriyabanijyabank.kyc.STOP_SCREEN_CAPTURE"
        const val EXTRA_RESULT_CODE = "extra_result_code"
        const val EXTRA_RESULT_DATA = "extra_result_data"
        const val EXTRA_SESSION_ID = "extra_session_id"
        private const val NOTIFICATION_CHANNEL_ID = "rbb_screen_share_channel"
        private const val NOTIFICATION_ID = 4001
    }

    private var mediaProjection: MediaProjection? = null
    private var virtualDisplay: VirtualDisplay? = null
    private var surfaceTextureHelper: SurfaceTextureHelper? = null
    private var videoCapturer: ScreenCapturerAndroid? = null
    private var webRTCManager: WebRTCManager? = null
    private var sessionId: String? = null

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START -> {
                val resultCode = intent.getIntExtra(EXTRA_RESULT_CODE, 0)
                val resultData: Intent? = intent.getParcelableExtra(EXTRA_RESULT_DATA)
                sessionId = intent.getStringExtra(EXTRA_SESSION_ID)

                if (resultCode != 0 && resultData != null) {
                    startForegroundWithNotification()
                    startCapture(resultCode, resultData)
                }
            }
            ACTION_STOP -> {
                stopCapture()
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
            }
        }
        return START_NOT_STICKY
    }

    private fun startForegroundWithNotification() {
        val notification: Notification = NotificationCompat.Builder(this, NOTIFICATION_CHANNEL_ID)
            .setContentTitle("Rastriya Banijya Bank KYC Remote Assistance")
            .setContentText("Screen sharing is active. Tap to manage.")
            .setSmallIcon(android.R.drawable.ic_menu_camera)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .build()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION
            )
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    private fun startCapture(resultCode: Int, resultData: Intent) {
        val projectionManager = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        mediaProjection = projectionManager.getMediaProjection(resultCode, resultData)

        // Register permission revocation listener
        mediaProjection?.registerCallback(object : MediaProjection.Callback() {
            override fun onStop() {
                super.onStop()
                // The user revoked screen capture permission from OS dialog
                stopCapture()
                stopSelf()
            }
        }, null)

        // Initialize Native WebRTC Video Capturer
        val eglBase = EglBase.create()
        surfaceTextureHelper = SurfaceTextureHelper.create("ScreenCaptureThread", eglBase.eglBaseContext)
        videoCapturer = ScreenCapturerAndroid(resultData, object : MediaProjection.Callback() {
            override fun onStop() {
                stopCapture()
            }
        })

        // Connect with WebRTC Manager
        webRTCManager = WebRTCManager(applicationContext, eglBase, sessionId)
        webRTCManager?.start(videoCapturer!!, surfaceTextureHelper!!)
    }

    private fun stopCapture() {
        try {
            webRTCManager?.stop()
            webRTCManager = null

            videoCapturer?.stopCapture()
            videoCapturer?.dispose()
            videoCapturer = null

            surfaceTextureHelper?.dispose()
            surfaceTextureHelper = null

            virtualDisplay?.release()
            virtualDisplay = null

            mediaProjection?.stop()
            mediaProjection = null
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                NOTIFICATION_CHANNEL_ID,
                "Screen Share Service",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Notification displayed while device screen is streamed via WebRTC"
            }
            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(channel)
        }
    }

    override fun onDestroy() {
        stopCapture()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
