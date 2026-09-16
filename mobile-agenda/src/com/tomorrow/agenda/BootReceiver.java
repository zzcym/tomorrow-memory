package com.tomorrow.agenda;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** 开机重启后恢复所有闹钟(提醒 + 每日汇总) */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) {
            AlarmReceiver.ensureChannels(context);
            Scheduler.scheduleAll(context);
        }
    }
}
