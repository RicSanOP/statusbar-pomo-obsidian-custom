import { App, Notice, PluginSettingTab, Setting } from 'obsidian';
import { appHasDailyNotesPluginLoaded } from 'obsidian-daily-notes-interface';
import { whiteNoiseUrl } from './audio_urls';
import PomoTimerPlugin from './main';
import { WhiteNoise } from './white_noise';

export interface PomoSettings {
	pomo: number;
	shortBreak: number;
	longBreak: number;
	longBreakInterval: number;
	autostartTimer: boolean;
	numAutoCycles: number;
	// @DONE add flowtime options here
	flowSteps: [number, number][]; // note that the first step must always start at zero if the minute value (index 0) is meant to indicate anything above that number of minutes
	flowStepAddTemp: number;
	ribbonIcon: boolean;
	emoji: boolean;
	notificationSound: boolean;
	useSystemNotification: boolean;
	backgroundNoiseFile: string;
	logging: boolean;
	logFile: string;
	logText: string;
	logToDaily: boolean;
	logActiveNote: boolean;
	fancyStatusBar: boolean;
	whiteNoise: boolean;
}

export const DEFAULT_SETTINGS: PomoSettings = {
	pomo: 25,
	shortBreak: 5,
	longBreak: 15,
	longBreakInterval: 4,
	autostartTimer: true,
	numAutoCycles: 0,
	flowSteps: [[0, 5]],
	flowStepAddTemp: 0,
	ribbonIcon: true,
	emoji: true,
	notificationSound: true,
	useSystemNotification: false,
	backgroundNoiseFile: "",
	logging: false,
	logFile: "Pomodoro Log.md",
	logToDaily: false,
	logText: "[🍅] dddd, MMMM DD YYYY, h:mm A",
	logActiveNote: false,
	fancyStatusBar: false,
	whiteNoise: false,
}

// @DONE some constants for more legible access to the flowSteps array of pairs
export const FS_TIME: number = 0
export const FS_BREAK: number = 1

export class PomoSettingTab extends PluginSettingTab {
	plugin: PomoTimerPlugin;

	constructor(app: App, plugin: PomoTimerPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		let { containerEl } = this;
		containerEl.empty();
		containerEl.createEl('h2', { text: 'Timer' });

	
		/**************  Timer settings **************/

		new Setting(containerEl)
			.setName("Pomodoro time (minutes)")
			.setDesc("Leave blank for default")
			.addText(text => text
				.setValue(this.plugin.settings.pomo.toString())
				.onChange(value => {
					this.plugin.settings.pomo = setNumericValue(value, DEFAULT_SETTINGS.pomo, this.plugin.settings.pomo);
					this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName("Short break time (minutes)")
			.setDesc("Leave blank for default")
			.addText(text => text
				.setValue(this.plugin.settings.shortBreak.toString())
				.onChange(value => {
					this.plugin.settings.shortBreak = setNumericValue(value, DEFAULT_SETTINGS.shortBreak, this.plugin.settings.shortBreak);
					this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName("Long break time (minutes)")
			.setDesc("Leave blank for default")
			.addText(text => text
				.setValue(this.plugin.settings.longBreak.toString())
				.onChange(value => {
					this.plugin.settings.longBreak = setNumericValue(value, DEFAULT_SETTINGS.longBreak, this.plugin.settings.longBreak);
					this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName("Long break interval")
			.setDesc("Number of pomos before a long break; leave blank for default")
			.addText(text => text
				.setValue(this.plugin.settings.longBreakInterval.toString())
				.onChange(value => {
					this.plugin.settings.longBreakInterval = setNumericValue(value, DEFAULT_SETTINGS.longBreakInterval, this.plugin.settings.longBreakInterval);
					this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName("Autostart timer")
			.setDesc("Start each pomodoro and break automatically. When off, click the sidebar icon on the left or use the toggle pause command to start the next timer")
			.addToggle(toggle => toggle
					.setValue(this.plugin.settings.autostartTimer)
					.onChange(value => {
						this.plugin.settings.autostartTimer = value;
						this.plugin.saveSettings();
						this.display() //force refresh
					}));

		if (this.plugin.settings.autostartTimer === false) {
			new Setting(containerEl)
				.setName("Cycles before pause")
				.setDesc("Number of pomodoro + break cycles to run automatically before stopping. Default is 0 (stops after every pomodoro and every break)")
				.addText(text => text
					.setValue(this.plugin.settings.numAutoCycles.toString())
					.onChange(value => {
						this.plugin.settings.numAutoCycles = setNumericValue(value, DEFAULT_SETTINGS.numAutoCycles, this.plugin.settings.numAutoCycles);
						this.plugin.timer.cyclesSinceLastAutoStop = 0;
						this.plugin.saveSettings();
					}));
		}

		// @DONE flowtime break brackets settings here
		new Setting(containerEl)
		.setName("Add Flowtime step")
		.setDesc("Add a new flowtime step. The time is relative to the start of the pomodoro not the end. When toggled (temporarily or permanently), pomodoros convert from timers into stopwatches with variable endtimes. Requires plugin reload to apply")
		.addText(text => text
			.setPlaceholder(`>${this.plugin.settings.pomo} minutes`)
			.onChange(value => {
				this.plugin.settings.flowStepAddTemp = setNumericValue(value, DEFAULT_SETTINGS.flowStepAddTemp, this.plugin.settings.flowStepAddTemp);
				this.plugin.saveSettings();
			}))
		.addButton(button => button
			.setIcon("plus")
			.onClick(() => {
				// check if the flowSteps array already contains this timestep and ignore
				if (this.plugin.settings.flowSteps.some(pair => pair[FS_TIME] == this.plugin.settings.flowStepAddTemp))
					return;
				// if not already in array, then create new pair, push to array and resort
				let newPair: [number, number] = [this.plugin.settings.flowStepAddTemp, DEFAULT_SETTINGS.flowSteps[0][FS_BREAK]];
				this.plugin.settings.flowSteps.push(newPair);
				this.plugin.settings.flowSteps.sort((a, b) => a[FS_TIME] - b[FS_TIME]);
				this.plugin.settings.flowStepAddTemp = DEFAULT_SETTINGS.flowStepAddTemp;
				this.plugin.saveSettings();
				this.display();
			}));

		for (let i = 0; i < this.plugin.settings.flowSteps.length; i++) {
			new Setting(containerEl)
			.setName(`${this.plugin.settings.flowSteps[i][FS_TIME]} min`)
			.addText(text => text
				.setValue(this.plugin.settings.flowSteps[i][FS_BREAK].toString())
				.onChange(value => {
					this.plugin.settings.flowSteps[i][FS_BREAK] = setNumericValue(value, DEFAULT_SETTINGS.flowSteps[0][FS_BREAK], this.plugin.settings.flowSteps[i][FS_BREAK]);
					this.plugin.saveSettings();
				}))
			.addButton(button => button
				.setIcon("minus")
				.onClick(() => {
					// sleek way of making sure the first element is always 0min and never removed
					if (i == 0)
						return;
					const stepsBefore = this.plugin.settings.flowSteps.slice(0, i);
					const stepsAfter = this.plugin.settings.flowSteps.slice(i+1);
					this.plugin.settings.flowSteps = stepsBefore.concat(stepsAfter);
					this.plugin.saveSettings();
					this.display();
				}));

		}

		/************** Appearance ************************/

		containerEl.createEl("h2", { text: "Appearance"});
		new Setting(containerEl)
		.setName("Sidebar icon")
		.setDesc("Toggle left sidebar icon. Restart Obsidian for the change to take effect")
		.addToggle(toggle => toggle
				.setValue(this.plugin.settings.ribbonIcon)
				.onChange(value => {
					this.plugin.settings.ribbonIcon = value;
					this.plugin.saveSettings();
				}));

		new Setting(containerEl)
		.setName("Timer emoji")
		.setDesc("Toggle 🏖️/🍅/🥋 emoji that indicate whether a timer is a pomodoro, a flowtime or a break.")
		.addToggle(toggle => toggle
				.setValue(this.plugin.settings.emoji)
				.onChange(value => {
					this.plugin.settings.emoji = value;
					this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName("System notification")
			.setDesc("Use system notifications at the end of each pomodoro and break")
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.useSystemNotification)
				.onChange(value => {
					this.plugin.settings.useSystemNotification = value;
					this.plugin.saveSettings();
				}));


		/**************  Sound settings **************/
		containerEl.createEl("h2", { text: "Sound"});
	
		new Setting(containerEl)
			.setName("Notification sound")
			.setDesc("Play notification sound at the end of each pomodoro and break")
			.addToggle(toggle => toggle
					.setValue(this.plugin.settings.notificationSound)
					.onChange(value => {
						this.plugin.settings.notificationSound = value;
						this.plugin.saveSettings();
					}));

		new Setting(containerEl)
			.setName("White noise")
			.setDesc("Play white noise while timer is active")
			.addToggle(toggle => toggle
					.setValue(this.plugin.settings.whiteNoise)
					.onChange(value => {
						this.plugin.settings.whiteNoise = value;
						this.plugin.saveSettings();

						if (this.plugin.settings.whiteNoise === true) {
							this.plugin.timer.whiteNoisePlayer = new WhiteNoise(this.plugin, whiteNoiseUrl);
							this.plugin.timer.whiteNoisePlayer.whiteNoise();
						} else { //if false, turn it off immediately
							this.plugin.timer.whiteNoisePlayer.stopWhiteNoise();
						}

						this.display();
					}));


		/**************  Logging settings **************/
		containerEl.createEl("h2", { text: "Logging"});

		new Setting(containerEl)
			.setName("Logging")
			.setDesc("Enable a log of completed pomodoros and flowtimes.")
			.addToggle(toggle => toggle
					.setValue(this.plugin.settings.logging)
					.onChange(value => {
						this.plugin.settings.logging = value;

						if (value === true) {
							this.plugin.openLogFileOnClick();
						} else {
							this.plugin.statusBar.removeClass("statusbar-pomo-logging");
						}

						this.plugin.saveSettings();
						this.display(); //force refresh
					}));

		//various logging settings; only show if logging is enabled (currently does not autohide, only)
		if (this.plugin.settings.logging === true) {

			new Setting(containerEl)
				.setName("Log file")
				.setDesc("If file doesn't already exist, it will be created")
				.addText(text => text
					.setValue(this.plugin.settings.logFile.toString())
					.onChange(value => {
						this.plugin.settings.logFile = value;
						this.plugin.saveSettings();
					}));

			new Setting(containerEl)
				.setName("Log to daily note")
				.setDesc("Logs to the end of today's daily note")
				.addToggle(toggle => toggle
					.setValue(this.plugin.settings.logToDaily)
					.onChange(value => {
						if (appHasDailyNotesPluginLoaded() === true) {
							this.plugin.settings.logToDaily = value;
						} else if (value === true) {
							this.plugin.settings.logToDaily = false;
							new Notice("Please enable daily notes plugin");
						}
						this.plugin.saveSettings();

					}));
	

			new Setting(containerEl)
				.setName("Timestamp Format")
				.setDesc("Specify format for the logtext using moment syntax. The special placeholders $1, $2, $3 can be used to insert the session duration (minutes), mode emoji and mode text respectively. Square brackets can be used to escape substrings from moment.js formatting.")
				.addMomentFormat(text => text
					.setDefaultFormat(this.plugin.settings.logText)
					.setValue(this.plugin.settings.logText)
					.onChange(value => {
						this.plugin.settings.logText = value;
						this.plugin.saveSettings();
					}));

			new Setting(containerEl)
			.setName("Log active note")
			.setDesc("In log, append link pointing to the note that was active when you started the pomodoro")
			.addToggle(toggle => toggle
					.setValue(this.plugin.settings.logActiveNote)
					.onChange(value => {
						this.plugin.settings.logActiveNote = value;
						this.plugin.saveSettings();
					}));
		}
	}
}

//sets the setting for the given to value if it's a valid, default if empty, otherwise sends user error notice
function setNumericValue(value: string, defaultSetting: number, currentSetting: number){
	if (value === '') { //empty string -> reset to default
		return defaultSetting;
	} else if (!isNaN(Number(value)) && (Number(value) > 0)) { //if positive number, set setting
		return Number(value);
	} else { //invalid input
		new Notice("Please specify a valid number.");
		return currentSetting;
	}
}
