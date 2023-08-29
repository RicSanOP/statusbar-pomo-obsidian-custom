import { Notice, moment, TFolder, TFile } from 'obsidian';
import { getDailyNote, createDailyNote, getAllDailyNotes } from 'obsidian-daily-notes-interface';
import { notificationUrl, whiteNoiseUrl } from './audio_urls';
import { WhiteNoise } from './white_noise';
import { FS_BREAK, FS_TIME, PomoSettings } from './settings';
import PomoTimerPlugin from './main';

const electron = require("electron");

const MILLISECS_IN_MINUTE = 60 * 1000;

export const enum Mode {
	Pomo,
	// @DONE add mode for flowtime extension
	Flow,
	ShortBreak,
	LongBreak,
	NoTimer
}


export class Timer {
	plugin: PomoTimerPlugin;
	settings: PomoSettings;
	originTime: moment.Moment; /*the first start time set for the currently running timer*/
	startTime: moment.Moment; /*when currently running timer started*/
	endTime: moment.Moment;   /*when currently running timer will end if not paused*/
	mode: Mode;
	// @DONE add the flowtime toggle state data variables here
	constFlow: boolean;  /*start pomodoros as flowtimes instead*/
	endFlow: boolean;  /*flag to end the flowtime stopwatch*/
	flowBreak: number; /*duration of the next short break in milliseconds*/
	totalTime: number;  /*total time running from first start of pomo/flow set */
	pausedTime: number;  /*time left on paused timer, in milliseconds*/
	paused: boolean;
	autoPaused: boolean;
	pomosSinceStart: number;
	cyclesSinceLastAutoStop: number;
	activeNote: TFile;
	whiteNoisePlayer: WhiteNoise;

	constructor(plugin: PomoTimerPlugin) {
		this.plugin = plugin;
		this.settings = plugin.settings;
		this.mode = Mode.NoTimer;
		this.constFlow = false;
		this.endFlow = false;
		this.paused = false;
		this.pomosSinceStart = 0;
		this.cyclesSinceLastAutoStop = 0;

		if (this.settings.whiteNoise === true) {
			this.whiteNoisePlayer = new WhiteNoise(plugin, whiteNoiseUrl);
		}
	}

	onRibbonIconClick() {
		if (this.mode === Mode.NoTimer) {  //if starting from not having a timer running/paused
			this.startTimer(Mode.Pomo);
		} else { //if timer exists, pause or unpause
			this.togglePause();
		}
	}

	/*Set status bar to remaining time or empty string if no timer is running*/
	//handling switching logic here, should spin out
	async setStatusBarText(): Promise<string> {
		if (this.mode !== Mode.NoTimer) {
			let timer_type_symbol = "";
			if (this.settings.emoji === true) {
				timer_type_symbol = "🏖️ ";
				if (this.mode === Mode.Pomo) {
					timer_type_symbol = "🍅 ";
				} else if (this.mode === Mode.Flow) {
					// @DONE add flowtime emoji symbol
					timer_type_symbol = "🥋 "
				}
			}

			if (this.mode !== Mode.Flow) {
				if (this.paused === true) {
					return timer_type_symbol + millisecsToString(this.pausedTime); //just show the paused time
				} else if (moment().isSameOrAfter(this.endTime)) {
					await this.handleTimerEnd();
				} else {
					return timer_type_symbol + millisecsToString(this.getCountdown()); //return display value
				}
			} else {
				// @DONE show stopwatch if in the middle of a flowtime
				if (this.paused === true) {
					return timer_type_symbol + millisecsToString(this.totalTime); //just show the paused time
				} else if (this.endFlow) {
					this.endFlow = false;
					await this.handleTimerEnd();
				} else {
					return timer_type_symbol + millisecsToString(this.getStopwatch()); //return display value
				}
			}
			return "💎";
			
		} else {
			return ""; //fixes TypeError: failed to execute 'appendChild' on 'Node https://github.com/kzhovn/statusbar-pomo-obsidian/issues/4
		}
	}

	async handleTimerEnd() {
		// @DONE account for case where flowtime ends
		if (this.mode === Mode.Pomo || this.mode === Mode.Flow) { //completed another pomo
			this.pomosSinceStart += 1;

			if (this.settings.logging === true) {
				await this.logPomo();
			}
		} else if (this.mode === Mode.ShortBreak || this.mode === Mode.LongBreak) {
			this.cyclesSinceLastAutoStop += 1;
		}

		//switch mode
		if (this.settings.notificationSound === true) { //play sound end of timer
			playNotification();
		}
		if (this.settings.useSystemNotification === true) { //show system notification end of timer
			showSystemNotification(this.mode, this.settings.emoji); // @WARN this causes nonstop pinging and breaks timer in linux flatpak
		}

		if (this.settings.autostartTimer === false && this.settings.numAutoCycles <= this.cyclesSinceLastAutoStop) { //if autostart disabled, pause and allow user to start manually
			this.setupTimer();
			this.autoPaused = true;
			this.paused = true;
			this.pausedTime = this.getTotalModeMillisecs();
			this.cyclesSinceLastAutoStop = 0;
		} else {
			this.startTimer();
		}
	}

	async quitTimer(): Promise<void> {
		this.mode = Mode.NoTimer;
		this.startTime = moment(0);
		this.endTime = moment(0);
		this.paused = false;
		this.pomosSinceStart = 0;

		if (this.settings.whiteNoise === true) {
			this.whiteNoisePlayer.stopWhiteNoise();
		}
		if (this.settings.logging === true) {
			await this.logPomo();
		}

		await this.plugin.loadSettings(); //why am I loading settings on quit? to ensure that when I restart everything is correct? seems weird
	}

	toggleFlowtime(isTemp: boolean) {
		if (isTemp && this.mode === Mode.Pomo) {
			// convert this session to flowtime
			this.mode = Mode.Flow;
		} else {
			// turn all pomos into flows
			if (this.constFlow) {
				this.constFlow = false;
			} else {
				this.constFlow = true;
				if (this.mode === Mode.Pomo)
					this.mode = Mode.Flow;
			}
		}
	}

	endFlowtime() {
		if (this.mode === Mode.Flow) {
			const totalMinutes = this.getStopwatch() / MILLISECS_IN_MINUTE;
			const breakIndex = this.settings.flowSteps.findLastIndex(e => e[FS_TIME] < totalMinutes);
			this.flowBreak = this.settings.flowSteps[breakIndex][FS_BREAK];
			this.endFlow = true;
			this.modeEndingNotification();
		}
	}

	pauseTimer(): void {
		this.paused = true;
		this.pausedTime = this.getCountdown();
		this.totalTime = this.getStopwatch();

		if (this.settings.whiteNoise === true) {
			this.whiteNoisePlayer.stopWhiteNoise();
		}
	}

	togglePause() {
		if (this.paused === true) {
			this.restartTimer();
		} else if (this.mode !== Mode.NoTimer) { //if some timer running
			this.pauseTimer();
			new Notice("Timer paused.")
		}
	}

	restartTimer(): void {
		if (this.settings.logActiveNote === true && this.autoPaused === true) {
			this.setLogFile();
			this.autoPaused = false;
		}

		this.setStartAndEndTime(this.pausedTime);
		this.modeRestartingNotification();
		this.paused = false;

		if (this.settings.whiteNoise === true) {
			this.whiteNoisePlayer.whiteNoise();
		}
	}

	startTimer(mode: Mode = null): void {
		this.setupTimer(mode);
		this.paused = false; //do I need this?

		if (this.settings.logActiveNote === true) {
			this.setLogFile()
		}

		this.modeStartingNotification();

		if (this.settings.whiteNoise === true) {
			this.whiteNoisePlayer.whiteNoise();
		}
	}

	private setupTimer(mode: Mode = null) {
		if (mode === null) { //no arg -> start next mode in cycle
			if (this.mode === Mode.Pomo || this.mode === Mode.Flow) {
				if (this.pomosSinceStart % this.settings.longBreakInterval === 0) {
					this.mode = Mode.LongBreak;
				} else {
					this.mode = Mode.ShortBreak;
				}
			} else { //short break, long break, or no timer
				if (this.constFlow) {
					// @DONE transition state to flowtime if constant flowtime is toggled on
					this.mode = Mode.Flow;
				} else {
					this.mode = Mode.Pomo;
				}
			}
		} else { //starting a specific mode passed to func
			this.mode = mode;
		}
		
		this.setStartAndEndTime(this.getTotalModeMillisecs(this.flowBreak));
		this.originTime = moment();
		this.totalTime = 0;
		this.flowBreak = 0;
	}

	setStartAndEndTime(millisecsLeft: number): void {
		this.startTime = moment(); //start time to current time
		this.endTime = moment().add(millisecsLeft, 'milliseconds');
	}

	/*Return milliseconds left until end of timer*/
	getCountdown(): number {
		let endTimeClone = this.endTime.clone(); //rewrite with freeze?
		return endTimeClone.diff(moment());
	}

	/*Return milliseconds from start of timer*/
	getStopwatch(): number {
		let startTimeClone = this.startTime.clone();
		return moment().diff(startTimeClone) + this.totalTime;
	}

	getTotalModeMillisecs(customBreak: number = 0): number {
		switch (this.mode) {
			case Mode.Pomo: {
				return this.settings.pomo * MILLISECS_IN_MINUTE;
			}
			case Mode.Flow: {
				return 0;
			}
			case Mode.ShortBreak: {
				// @DONE set time for short break if varying due to flowtime
				if (customBreak > 0) {
					return customBreak * MILLISECS_IN_MINUTE;
				} else {
					return this.settings.shortBreak * MILLISECS_IN_MINUTE;
				}
			}
			case Mode.LongBreak: {
				return this.settings.longBreak * MILLISECS_IN_MINUTE;
			}
			case Mode.NoTimer: {
				throw new Error("Mode NoTimer does not have an associated time value");
			}
		}
	}



	/**************  Notifications  **************/
	/*Sends notification corresponding to whatever the mode is at the moment it's called*/
	modeStartingNotification(): void {
		let time = this.getTotalModeMillisecs();
		let unit: string;

		if (time >= MILLISECS_IN_MINUTE) { /*display in minutes*/
			time = Math.floor(time / MILLISECS_IN_MINUTE);
			unit = 'minute';
		} else { /*less than a minute, display in seconds*/
			time = Math.floor(time / 1000); //convert to secs
			unit = 'second';
		}

		switch (this.mode) {
			case (Mode.Pomo): {
				new Notice(`Starting ${time} ${unit} pomodoro.`);
				break;
			}
			case (Mode.Flow): {
				new Notice(`Starting flow at ${this.totalTime / MILLISECS_IN_MINUTE} ${unit}`);
				break;
			}
			case (Mode.ShortBreak):
			case (Mode.LongBreak): {
				new Notice(`Starting ${time} ${unit} break.`);
				break;
			}
			case (Mode.NoTimer): {
				new Notice('Quitting pomodoro timer.');
				break;
			}
		}
	}

	modeRestartingNotification(): void {
		switch (this.mode) {
			case (Mode.Pomo):
			case (Mode.Flow): {
				new Notice(`Restarting pomodoro-flowtime.`);
				break;
			}
			case (Mode.ShortBreak):
			case (Mode.LongBreak): {
				new Notice(`Restarting break.`);
				break;
			}
		}
	}


	// @DONE new notification type for stopping flowtime session
	modeEndingNotification(): void {
		switch (this.mode) {
			case (Mode.Flow): {
				new Notice("Ending flowtime.");
				break;
			}
		}
	}

	/**************  Logging  **************/
	async logPomo(): Promise<void> {
		var logText = moment().format(this.settings.logText);

		// @DONE replace placeholders with appropriate string, duration or emoji
		var logEmoji = "🏖️";
		var logType = "break"
		if (this.mode === Mode.Pomo) {
			logEmoji = "🍅";
			logType = "pomodoro";
		} else if (this.mode === Mode.Flow) {
			logEmoji = "🥋";
			logType = "flowtime";
		}
		var logDur = Math.floor(moment().diff(this.originTime, 'minutes'));
		logText = logText.replace('$1', logDur.toString());
		logText = logText.replace('$2', logEmoji);
		logText = logText.replace('$3', logType);
		
		const logFilePlaceholder = "{{logFile}}";

		if (this.settings.logActiveNote === true) {
			let linkText = this.plugin.app.fileManager.generateMarkdownLink(this.activeNote, '');
			if (logText.includes(logFilePlaceholder)) {
				logText = logText.replace(logFilePlaceholder, linkText);
			} else {
				logText = logText + " " + linkText;
			}

			logText = logText.replace(String.raw`\n`, "\n");
		}

		if (this.settings.logToDaily === true) { //use today's note
			let file = (await getDailyNoteFile()).path;
			await this.appendFile(file, logText);
		} else { //use file given in settings
			let file = this.plugin.app.vault.getAbstractFileByPath(this.settings.logFile);

			if (!file || file !instanceof TFolder) { //if no file, create
				console.log("Creating pomodoro log file");
				await this.plugin.app.vault.create(this.settings.logFile, "");
			}

			await this.appendFile(this.settings.logFile, logText);
		}
	}

	//from Note Refactor plugin by James Lynch, https://github.com/lynchjames/note-refactor-obsidian/blob/80c1a23a1352b5d22c70f1b1d915b4e0a1b2b33f/src/obsidian-file.ts#L69
	async appendFile(filePath: string, logText: string): Promise<void> {
		let existingContent = await this.plugin.app.vault.adapter.read(filePath);
		if (existingContent.length > 0) {
			existingContent = existingContent + '\r';
		}
		await this.plugin.app.vault.adapter.write(filePath, existingContent + logText);
	}

	setLogFile(){
		const activeView = this.plugin.app.workspace.getActiveFile();
		if (activeView) {
			this.activeNote = activeView;
		}
	}
}

/*Returns [HH:]mm:ss left on the current timer*/
function millisecsToString(millisecs: number): string {
	let formattedCountDown: string;

	if (millisecs >= 60 * 60 * 1000) { /* >= 1 hour*/
		formattedCountDown = moment.utc(millisecs).format('HH:mm:ss');
	} else {
		formattedCountDown = moment.utc(millisecs).format('mm:ss');
	}

	return formattedCountDown.toString();
}

function playNotification(): void {
	const audio = new Audio(notificationUrl);
	audio.play();
}

// @DONE add notification for flowtime case
function showSystemNotification(mode:Mode, useEmoji:boolean): void {
	let text = "";
	switch (mode) {
		case (Mode.Flow):
		case (Mode.Pomo): {
			let emoji = useEmoji ? "🏖" : ""
			text = `End of the pomodoro-flowtime, time to take a break ${emoji}`;
			break;
		}
		case (Mode.ShortBreak):
		case (Mode.LongBreak): {
			let emoji = useEmoji ? this.constFlow ? "🥋" : "🍅" : ""
			text = `End of the break, time for the next pomodoro-flowtime ${emoji}`;
			break;
		}
		case (Mode.NoTimer): {
			// no system notification needed
			return;
		}
	}
	let emoji = useEmoji ? "🍅" : ""
	let title = `Obsidian Pomodoro ${emoji}`;

	// Show system notification
	const Notification = (electron as any).remote.Notification;
	const n = new Notification({
		title: title,
		body: text,
		silent: true
	});
	n.on("click", () => {
		n.close();
	});
	n.show();
}

export async function getDailyNoteFile(): Promise<TFile> {
	const file = getDailyNote(moment() as any, getAllDailyNotes()); // as any, because getDailyNote is importing its own Moment and I'm using Obsidian's

	if (!file) {
		return await createDailyNote(moment() as any);
	}

	return file;
}






