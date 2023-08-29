import { Plugin } from 'obsidian';
import { PomoSettingTab, PomoSettings, DEFAULT_SETTINGS } from './settings';
import { getDailyNoteFile, Mode, Timer } from './timer';


export default class PomoTimerPlugin extends Plugin {
	settings: PomoSettings;
	statusBar: HTMLElement;
	timer: Timer;

	async onload() {
		console.log('Loading status bar pomodoro timer');

		await this.loadSettings();
		this.addSettingTab(new PomoSettingTab(this.app, this));

		this.statusBar = this.addStatusBarItem();
		this.statusBar.addClass("statusbar-pomo");
		if (this.settings.logging === true) {
			this.openLogFileOnClick();
		}

		this.timer = new Timer(this);

		/*Adds icon to the left side bar which starts the pomo timer when clicked
		  if no timer is currently running, and otherwise quits current timer*/
		if (this.settings.ribbonIcon === true) {
			this.addRibbonIcon('clock', 'Start pomodoro', async () => {
				this.timer.onRibbonIconClick();
			});
		}

		/*Update status bar timer ever half second
		  Ideally should change so only updating when in timer mode
		  - regular conditional doesn't remove after quit, need unload*/
		this.registerInterval(window.setInterval(async () =>
			this.statusBar.setText(await this.timer.setStatusBarText()), 500));

		this.addCommand({
			id: 'start-satusbar-pomoflow',
			name: 'Start pomodoro-flowtime',
			icon: 'play',
			checkCallback: (checking: boolean) => {
				let leaf = this.app.workspace.activeLeaf;
				if (leaf) {
					if (!checking) {
						if (this.timer.constFlow) {
							this.timer.startTimer(Mode.Flow);
						} else {
							this.timer.startTimer(Mode.Pomo);
						}
					}
					return true;
				}
				return false;
			}
		});

		this.addCommand({
			id: 'pause-satusbar-pomoflow',
			name: 'Toggle timer pause',
			icon: 'pause',
			checkCallback: (checking: boolean) => {
				let leaf = this.app.workspace.activeLeaf;
				if (leaf && this.timer.mode !== Mode.NoTimer) {
					if (!checking) {
						this.timer.togglePause();
					}
					return true;
				}
				return false;
			}
		});

		this.addCommand({
			id: 'quit-satusbar-pomoflow',
			name: 'Quit timer',
			icon: 'quit',
			checkCallback: (checking: boolean) => {
				let leaf = this.app.workspace.activeLeaf;
				if (leaf && this.timer.mode !== Mode.NoTimer) {
					if (!checking) {
						this.timer.quitTimer();
					}
					return true;
				}
				return false;
			}
		});

		// @DONE flowtime mode and session management commands
		this.addCommand({
			id: 'toggle-statusbar-pomoflow',
			name: 'Toggle flowtime',
			icon: '',
			checkCallback: (checking: boolean) => {
				let leaf = this.app.workspace.activeLeaf;
				if (leaf) {
					if (!checking) {
						this.timer.toggleFlowtime(false);
					}
					return true;
				}
				return false;
			}
		});

		this.addCommand({
			id: 'begin-flow-statusbar-pomoflow',
			name: 'Go into flowtime (single stopwatch session)',
			icon: '',
			checkCallback: (checking: boolean) => {
				let leaf = this.app.workspace.activeLeaf;
				if (leaf && this.timer.mode === Mode.Pomo) {
					if (!checking) {
						this.timer.toggleFlowtime(true);
					}
					return true;
				}
				return false;
			}
		});

		this.addCommand({
			id: 'end-flow-statusbar-pomoflow',
			name: 'End flowtime stopwatch',
			icon: '',
			checkCallback: (checking: boolean) => {
				let leaf = this.app.workspace.activeLeaf;
				if (leaf && this.timer.mode === Mode.Flow) {
					if (!checking) {
						this.timer.endFlowtime();
					}
					return true;
				}
				return false;
			}
		});
	}


	//on click, open log file; from Day Planner https://github.com/lynchjames/obsidian-day-planner/blob/c8d4d33af294bde4586a943463e8042c0f6a3a2d/src/status-bar.ts#L53
	openLogFileOnClick() {
		this.statusBar.addClass("statusbar-pomo-logging");

		this.statusBar.onClickEvent(async (ev: any) => {
			if (this.settings.logging === true) { //this is hacky, ideally I'd just unwatch the onClickEvent as soon as I turned logging off
				try {
					var file: string;
					if (this.settings.logToDaily === true) {
						file = (await getDailyNoteFile()).path;
					} else {
						file = this.settings.logFile;
					}

					this.app.workspace.openLinkText(file, '', false);
				} catch (error) {
					console.log(error);
				}
			}
		});
	}

	onunload() {
		this.timer.quitTimer();
		console.log('Unloading status bar pomodoro timer');
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}