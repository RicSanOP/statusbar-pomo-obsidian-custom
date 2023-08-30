# Status Bar Pomo-Flow Timer for Obsidian

Plugin that displays a [pomodoro timer](https://en.wikipedia.org/wiki/Pomodoro_Technique) in the [Obsidian](https://obsidian.md/) status bar. 

![timer screenshot](timer_screenshot.png)

## New Feature: Flowtime

Flowtime can be viewed as the polar opposite to the Pomodoro technique. It allows for variable work sessions with break lengths based on the length of the session (read more here https://zapier.com/blog/flowtime-technique/). This custom version of the `statusbar-pomo-obsidian` plugin is accompanied with a flowtime system that works in conjunction with pomodoros.

In order to make use of the system, you must first set your flow steps in the plugin's settings. The flow steps pretty much are used to determine how long you can rest based on the length of your prior flowtime session, which uses a stopwatch instead of a countdown timer.

The plugin comes with 3 new commands to operate the flowtime system:
- Toggle flowtime: this command permanently switches between pomodoro and flowtime mode. If turned on mid pomodoro, the pomodoro will switch into a flowtime and the statusbar countdown timer will switch into a stopwatch. Subsequent work sessions will start as flowtimes.
- Go into flowtime: this command is only available during a pomodoro countdown and is used to convert that single pomodoro into a flowtime. When used, the pomodoro countdown timer will switch into a stopwatch until the session is ended. Subsequent sessions will revert to pomodoros.
- End flowtime stopwatch: this command is only avaible during a flowtime and is used to end the current session and proceed to the next break. Note that it will invoke a logging call if the feature is enabled.

To account for these new changes, the logging feature now includes placeholders $1, $2, $3 which are replaced with the number of minutes in the session, the emoji of the mode and the type (pomodoro/flowtime) of the mode respecttively. You can configure this in the settings.

## Use
Click the clock icon in the left ribbon panel to start. Click again to toggle pause.

All of these actions are available from the command pallete. You can also set a hotkey to quit the timer.

## Settings

You can change the duration of the pomodoro timer, breaks, and interval between long breaks, and toggle the end of timer sound and white noise.

Autostart timer allows you to toggle whether the next break or pomodoro start automatically after the next, or waits for you to start it. If disabled, you can specify a number of pomodoro-and-break cycles that run automatically (for instance, if you want to run two pomodoros and their corresponding breaks without stopping and then pause, enter 2).

### Logging

If you enable logging, the plugin will write to the file you specify as your log file at the end of each pomodoro. If no such file exists, it will be created at the end of your first pomo. By default, the log message is "🍅 dddd, MMMM DD YYYY, h:mm A" (e.g. "🍅 Friday, July 16 2021, 6:18 PM"), but you can specify your own message using [moment display format](https://momentjs.com/docs/#/displaying/format/).

"Log to daily note" will append the log to the daily note. Please note that this currently *only* works by appending to the end of the file.

"Log active note" will include a link to the active note at the time the pomodoro timer started in the log message. Be default, the link to the note will appear after the timestamp, but you can customize the location using [{{logFile}}].

You can open the current log file by clicking the timer.