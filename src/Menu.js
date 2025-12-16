// Menu.js - Start and Game Over menu management with Settings and Multiplayer Lobby
export class Menu {
    constructor() {
        this.elements = {
            startMenu: document.getElementById('start-menu'),
            gameOverMenu: document.getElementById('game-over-menu'),
            settingsPanel: document.getElementById('settings-panel'),
            loading: document.getElementById('loading'),
            startBtn: document.getElementById('start-btn'),
            restartBtn: document.getElementById('restart-btn'),
            settingsBtn: document.getElementById('settings-btn'),
            settingsBackBtn: document.getElementById('settings-back-btn'),
            particlesToggle: document.getElementById('particles-toggle'),
            flickerToggle: document.getElementById('flicker-toggle'),
            hitmarkerToggle: document.getElementById('hitmarker-toggle'),
            highScore: document.getElementById('high-score'),
            finalScore: document.getElementById('final-score'),
            finalTime: document.getElementById('final-time'),
            newHighScore: document.getElementById('new-high-score'),
            // Multiplayer elements
            multiplayerBtn: document.getElementById('multiplayer-btn'),
            multiplayerLobby: document.getElementById('multiplayer-lobby'),
            playerNameInput: document.getElementById('player-name'),
            serverUrlInput: document.getElementById('server-url'),
            connectBtn: document.getElementById('connect-btn'),
            lobbyBackBtn: document.getElementById('lobby-back-btn'),
            lobbyStatus: document.getElementById('lobby-status'),
            lobbyStatusText: document.getElementById('lobby-status-text'),
            lobbyPlayers: document.getElementById('lobby-players'),
            playerList: document.getElementById('player-list'),
            // Multiplayer game over
            mpGameOver: document.getElementById('multiplayer-game-over'),
            mpResultTitle: document.getElementById('mp-result-title'),
            mpResultSubtitle: document.getElementById('mp-result-subtitle'),
            mpFinalScores: document.getElementById('mp-final-scores'),
            mpPlayAgainBtn: document.getElementById('mp-play-again-btn'),
            mpMenuBtn: document.getElementById('mp-menu-btn'),
            // Sensitivity slider
            sensitivitySlider: document.getElementById('sensitivity-slider'),
            sensitivityValue: document.getElementById('sensitivity-value'),
            // Pause menu elements
            pauseMenu: document.getElementById('pause-menu'),
            resumeBtn: document.getElementById('resume-btn'),
            voteRestartBtn: document.getElementById('vote-restart-btn'),
            pauseSettingsBtn: document.getElementById('pause-settings-btn'),
            disconnectBtn: document.getElementById('disconnect-btn')
        };

        // Settings state (load from localStorage)
        this.settings = {
            particles: localStorage.getItem('fps_particles') !== 'false',
            flickerLights: localStorage.getItem('fps_flicker') !== 'false',
            hitmarkers: localStorage.getItem('fps_hitmarkers') !== 'false',
            sensitivity: parseFloat(localStorage.getItem('fps_sensitivity')) || 5
        };

        // Load saved player name
        const savedName = localStorage.getItem('fps_player_name');
        if (savedName && this.elements.playerNameInput) {
            this.elements.playerNameInput.value = savedName;
        }

        // Apply initial toggle states
        if (this.elements.particlesToggle) {
            this.elements.particlesToggle.checked = this.settings.particles;
        }
        if (this.elements.flickerToggle) {
            this.elements.flickerToggle.checked = this.settings.flickerLights;
        }
        if (this.elements.hitmarkerToggle) {
            this.elements.hitmarkerToggle.checked = this.settings.hitmarkers;
        }
        if (this.elements.sensitivitySlider) {
            this.elements.sensitivitySlider.value = this.settings.sensitivity;
        }
        if (this.elements.sensitivityValue) {
            this.elements.sensitivityValue.textContent = this.settings.sensitivity;
        }

        // Callbacks
        this.onStart = null;
        this.onRestart = null;
        this.onSettingsChange = null;
        this.onMultiplayerConnect = null;
        this.onMultiplayerDisconnect = null;
        this.onMultiplayerPlayAgain = null;
        // Pause menu callbacks
        this.onResume = null;
        this.onVoteRestart = null;
        this.onDisconnect = null;

        // Pause menu state
        this.isPaused = false;
        this.pauseSettingsOpen = false;

        this.setupEventListeners();
    }

    setupEventListeners() {
        this.elements.startBtn?.addEventListener('click', () => {
            if (this.onStart) {
                this.onStart();
            }
        });

        this.elements.restartBtn?.addEventListener('click', () => {
            if (this.onRestart) {
                this.onRestart();
            }
        });

        // Settings button
        this.elements.settingsBtn?.addEventListener('click', () => {
            this.showSettings();
        });

        // Settings back button - handle both main menu and pause menu context
        this.elements.settingsBackBtn?.addEventListener('click', () => {
            if (this.pauseSettingsOpen) {
                this.hidePauseSettings();
            } else {
                this.hideSettings();
            }
        });

        // Particles toggle
        this.elements.particlesToggle?.addEventListener('change', (e) => {
            this.settings.particles = e.target.checked;
            localStorage.setItem('fps_particles', this.settings.particles);
            if (this.onSettingsChange) {
                this.onSettingsChange('particles', this.settings.particles);
            }
        });

        // Flicker lights toggle
        this.elements.flickerToggle?.addEventListener('change', (e) => {
            this.settings.flickerLights = e.target.checked;
            localStorage.setItem('fps_flicker', this.settings.flickerLights);
            if (this.onSettingsChange) {
                this.onSettingsChange('flickerLights', this.settings.flickerLights);
            }
        });

        // Hitmarker toggle
        this.elements.hitmarkerToggle?.addEventListener('change', (e) => {
            this.settings.hitmarkers = e.target.checked;
            localStorage.setItem('fps_hitmarkers', this.settings.hitmarkers);
            if (this.onSettingsChange) {
                this.onSettingsChange('hitmarkers', this.settings.hitmarkers);
            }
        });

        // Sensitivity slider
        this.elements.sensitivitySlider?.addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            this.settings.sensitivity = value;
            localStorage.setItem('fps_sensitivity', value);
            if (this.elements.sensitivityValue) {
                this.elements.sensitivityValue.textContent = value;
            }
            if (this.onSettingsChange) {
                this.onSettingsChange('sensitivity', value);
            }
        });

        // Multiplayer button
        this.elements.multiplayerBtn?.addEventListener('click', () => {
            this.showMultiplayerLobby();
        });

        // Lobby back button
        this.elements.lobbyBackBtn?.addEventListener('click', () => {
            this.hideMultiplayerLobby();
            if (this.onMultiplayerDisconnect) {
                this.onMultiplayerDisconnect();
            }
        });

        // Connect button
        this.elements.connectBtn?.addEventListener('click', () => {
            this.handleConnect();
        });

        // Save player name on change
        this.elements.playerNameInput?.addEventListener('change', (e) => {
            localStorage.setItem('fps_player_name', e.target.value);
        });

        // Multiplayer game over buttons
        this.elements.mpPlayAgainBtn?.addEventListener('click', () => {
            if (this.onMultiplayerPlayAgain) {
                this.onMultiplayerPlayAgain();
            }
        });

        this.elements.mpMenuBtn?.addEventListener('click', () => {
            this.hideMpGameOver();
            this.showStart(0);
            if (this.onMultiplayerDisconnect) {
                this.onMultiplayerDisconnect();
            }
        });

        // Pause menu event listeners
        this.elements.resumeBtn?.addEventListener('click', () => {
            this.hidePauseMenu();
            if (this.onResume) {
                this.onResume();
            }
        });

        this.elements.voteRestartBtn?.addEventListener('click', () => {
            if (this.onVoteRestart) {
                this.onVoteRestart();
            }
        });

        this.elements.pauseSettingsBtn?.addEventListener('click', () => {
            this.showPauseSettings();
        });

        this.elements.disconnectBtn?.addEventListener('click', () => {
            this.hidePauseMenu();
            if (this.onDisconnect) {
                this.onDisconnect();
            }
            if (this.onMultiplayerDisconnect) {
                this.onMultiplayerDisconnect();
            }
        });
    }

    handleConnect() {
        const playerName = this.elements.playerNameInput?.value.trim() || 'Player';
        const serverUrl = this.elements.serverUrlInput?.value.trim() || 'ws://localhost:8080';

        // Save player name
        localStorage.setItem('fps_player_name', playerName);

        // Show connecting status
        this.showLobbyStatus('Connecting to server...');

        if (this.onMultiplayerConnect) {
            this.onMultiplayerConnect(serverUrl, playerName);
        }
    }

    showSettings() {
        this.elements.startMenu?.classList.add('hidden');
        this.elements.settingsPanel?.classList.remove('hidden');
    }

    hideSettings() {
        this.elements.settingsPanel?.classList.add('hidden');
        this.elements.startMenu?.classList.remove('hidden');
    }

    showMultiplayerLobby() {
        this.elements.startMenu?.classList.add('hidden');
        this.elements.multiplayerLobby?.classList.remove('hidden');
        this.hideLobbyStatus();
        this.hideLobbyPlayers();
    }

    hideMultiplayerLobby() {
        this.elements.multiplayerLobby?.classList.add('hidden');
        this.elements.startMenu?.classList.remove('hidden');
    }

    showLobbyStatus(text) {
        if (this.elements.lobbyStatus) {
            this.elements.lobbyStatus.classList.remove('hidden');
        }
        if (this.elements.lobbyStatusText) {
            this.elements.lobbyStatusText.textContent = text;
        }
    }

    hideLobbyStatus() {
        this.elements.lobbyStatus?.classList.add('hidden');
    }

    showLobbyPlayers(players, localPlayerId) {
        this.hideLobbyStatus();
        if (this.elements.lobbyPlayers) {
            this.elements.lobbyPlayers.classList.remove('hidden');
        }
        this.updatePlayerList(players, localPlayerId);
    }

    hideLobbyPlayers() {
        this.elements.lobbyPlayers?.classList.add('hidden');
    }

    updatePlayerList(players, localPlayerId) {
        if (!this.elements.playerList) return;

        this.elements.playerList.innerHTML = '';
        players.forEach(player => {
            const li = document.createElement('li');
            li.className = player.id === localPlayerId ? 'local' : '';

            const colorDiv = document.createElement('div');
            colorDiv.className = 'player-color';
            colorDiv.style.backgroundColor = `#${player.color.toString(16).padStart(6, '0')}`;

            const nameSpan = document.createElement('span');
            nameSpan.textContent = player.name + (player.id === localPlayerId ? ' (You)' : '');

            li.appendChild(colorDiv);
            li.appendChild(nameSpan);
            this.elements.playerList.appendChild(li);
        });
    }

    showConnectionError(message) {
        this.showLobbyStatus(message || 'Connection failed. Check server address.');
    }

    getSettings() {
        return this.settings;
    }

    hideLoading() {
        this.elements.loading?.classList.add('hidden');
    }

    showStart(highScore) {
        this.elements.startMenu?.classList.remove('hidden');
        this.elements.gameOverMenu?.classList.add('hidden');
        this.elements.settingsPanel?.classList.add('hidden');
        this.elements.multiplayerLobby?.classList.add('hidden');
        if (this.elements.highScore) {
            this.elements.highScore.textContent = `RECORD // ${highScore}`;
        }
    }

    hideStart() {
        this.elements.startMenu?.classList.add('hidden');
    }

    showGameOver(score, time, isNewHighScore) {
        this.elements.startMenu?.classList.add('hidden');
        this.elements.gameOverMenu?.classList.remove('hidden');
        this.elements.settingsPanel?.classList.add('hidden');
        if (this.elements.finalScore) {
            this.elements.finalScore.textContent = `Score: ${score}`;
        }
        if (this.elements.finalTime) {
            this.elements.finalTime.textContent = `Survived: ${time}s`;
        }

        if (isNewHighScore) {
            this.elements.newHighScore?.classList.remove('hidden');
        } else {
            this.elements.newHighScore?.classList.add('hidden');
        }
    }

    showMpGameOver(data) {
        this.hideAll();
        this.elements.mpGameOver?.classList.remove('hidden');

        // Set title based on outcome
        if (this.elements.mpResultTitle) {
            this.elements.mpResultTitle.textContent = data.reason || 'GAME OVER';
            this.elements.mpResultTitle.dataset.text = data.reason || 'GAME OVER';
        }

        // Build scores display
        if (this.elements.mpFinalScores && data.players) {
            this.elements.mpFinalScores.innerHTML = '';

            // Winner row
            if (data.winner) {
                const winnerRow = document.createElement('div');
                winnerRow.className = 'winner-row';
                winnerRow.innerHTML = `
                    <span class="crown">👑</span>
                    <span class="winner-name">${data.winner.name}</span>
                    <span class="winner-kills">${data.winner.kills} KILLS</span>
                `;
                this.elements.mpFinalScores.appendChild(winnerRow);
            }

            // Other players
            const sortedPlayers = [...data.players].sort((a, b) => b.kills - a.kills);
            sortedPlayers.forEach((player, index) => {
                const row = document.createElement('div');
                row.className = 'score-row';
                row.innerHTML = `
                    <span class="rank">#${index + 1}</span>
                    <span class="name">${player.name}</span>
                    <span class="stats">${player.kills}K / ${player.deaths}D</span>
                `;
                this.elements.mpFinalScores.appendChild(row);
            });
        }
    }

    hideMpGameOver() {
        this.elements.mpGameOver?.classList.add('hidden');
    }

    hideGameOver() {
        this.elements.gameOverMenu?.classList.add('hidden');
    }

    // Pause Menu Methods
    showPauseMenu(isMultiplayer = false) {
        this.isPaused = true;
        this.elements.pauseMenu?.classList.remove('hidden');

        // Update button text based on game mode
        const disconnectBtnText = this.elements.disconnectBtn?.querySelector('.btn-text');
        if (disconnectBtnText) {
            disconnectBtnText.textContent = isMultiplayer ? 'DISCONNECT' : 'MAIN MENU';
        }

        // Show/hide vote restart for multiplayer only
        if (this.elements.voteRestartBtn) {
            this.elements.voteRestartBtn.style.display = isMultiplayer ? 'flex' : 'none';
        }
    }

    hidePauseMenu() {
        this.isPaused = false;
        this.pauseSettingsOpen = false;
        this.elements.pauseMenu?.classList.add('hidden');
        this.elements.settingsPanel?.classList.add('hidden');
    }

    showPauseSettings() {
        this.pauseSettingsOpen = true;
        this.elements.pauseMenu?.classList.add('hidden');
        this.elements.settingsPanel?.classList.remove('hidden');
    }

    hidePauseSettings() {
        this.pauseSettingsOpen = false;
        this.elements.settingsPanel?.classList.add('hidden');
        this.elements.pauseMenu?.classList.remove('hidden');
    }

    togglePauseMenu(isMultiplayer = false) {
        if (this.pauseSettingsOpen) {
            this.hidePauseSettings();
            return true; // Still in pause menu
        }
        if (this.isPaused) {
            this.hidePauseMenu();
            return false;
        } else {
            this.showPauseMenu(isMultiplayer);
            return true;
        }
    }

    updateVoteRestartStatus(currentVotes, requiredVotes, hasVoted) {
        const btn = this.elements.voteRestartBtn;
        if (!btn) return;

        const btnText = btn.querySelector('.btn-text');
        if (btnText) {
            if (hasVoted) {
                btnText.textContent = `VOTED (${currentVotes}/${requiredVotes})`;
            } else {
                btnText.textContent = `VOTE RESTART (${currentVotes}/${requiredVotes})`;
            }
        }
    }

    hideAll() {
        this.elements.startMenu?.classList.add('hidden');
        this.elements.gameOverMenu?.classList.add('hidden');
        this.elements.settingsPanel?.classList.add('hidden');
        this.elements.loading?.classList.add('hidden');
        this.elements.multiplayerLobby?.classList.add('hidden');
        this.elements.mpGameOver?.classList.add('hidden');
        this.elements.pauseMenu?.classList.add('hidden');
        this.isPaused = false;
        this.pauseSettingsOpen = false;
    }
}
