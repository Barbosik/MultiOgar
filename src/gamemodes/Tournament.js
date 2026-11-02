var Mode = require('./Mode');

function Tournament() {
    Mode.apply(this, Array.prototype.slice.call(arguments));
    
    this.ID = 10;
    this.name = "Tournament";
    this.packetLB = 48;
    
    // Round timers advance in updateLB once per second, not on every physics tick.
    this.prepTime = 5; // Amount of ticks after the server fills up to wait until starting the game
    this.endTime = 15; // Amount of ticks after someone wins to restart the game
    this.autoFill = false;
    this.autoFillPlayers = 1;
    this.dcTime = 0;
    
    // Gamemode Specific Variables
    this.gamePhase = 0; // 0 = Waiting, 1 = Preparing, 2 = Playing, 3 = Winner, 4 = Timed out
    this.contenders = [];
    this.maxContenders = 12;
    
    this.winner;
    this.timer;
    this.timeLimit = 3600; // in seconds
}

module.exports = Tournament;
Tournament.prototype = new Mode();

// Gamemode Specific Functions

Tournament.prototype.countHumanPlayers = function () {
    return this.contenders.filter(function (player) {
        return player.socket && player.socket._socket && player.socket.isConnected;
    }).length;
};

Tournament.prototype.hasEnoughPlayers = function () {
    return this.countHumanPlayers() >= Math.max(1, this.autoFillPlayers);
};

Tournament.prototype.startGamePrep = function (gameServer) {
    if (!this.hasEnoughPlayers()) {
        return;
    }
    this.gamePhase = 1;
    this.timer = this.prepTime; // Configured preparation countdown, in seconds
};

Tournament.prototype.startGame = function (gameServer) {
    if (!this.hasEnoughPlayers()) {
        this.gamePhase = 0;
        this.timer = gameServer.config.tourneyAutoFill;
        return;
    }
    gameServer.run = true;
    this.gamePhase = 2;
    this.getSpectate(); // Gets a random person to spectate
    gameServer.config.playerDisconnectTime = this.dcTime; // Reset config
};

Tournament.prototype.endGame = function (gameServer) {
    this.winner = this.contenders.reduce(
        (winner, contender) =>
            contender.getScore() > winner.getScore() ? contender : winner,
        this.contenders[0]
    );
    this.gamePhase = 3;
    this.timer = this.endTime; // Configured restart countdown, in seconds
};

Tournament.prototype.endGameTimeout = function (gameServer) {
    gameServer.run = false;
    this.gamePhase = 4;
    this.timer = this.endTime; // Configured restart countdown, in seconds
};

Tournament.prototype.fillBots = function (gameServer) {
    if (!this.hasEnoughPlayers()) {
        return;
    }
    // Fills the server with bots if there arent enough players
    var fill = this.maxContenders - this.contenders.length;
    for (var i = 0; i < fill; i++) {
        gameServer.bots.addBot();
    }
};

Tournament.prototype.getSpectate = function () {
    // Finds a random person to spectate
    var index = Math.floor(Math.random() * this.contenders.length);
    this.rankOne = this.contenders[index];
};

Tournament.prototype.prepare = function (gameServer) {
    // Remove all cells
    var len = gameServer.nodes.length;
    for (var i = 0; i < len; i++) {
        var node = gameServer.nodes[0];
        
        if (!node) {
            continue;
        }
        
        gameServer.removeNode(node);
    }
    
    gameServer.bots.loadNames();
    
    // Pauses the server
    gameServer.run = false;
    this.gamePhase = 0;
    this.contenders = [];
    this.winner = null;
    this.rankOne = null;
    
    // Get config values
    this.timer = gameServer.config.tourneyAutoFill;
    this.autoFill = this.timer > 0;
    this.autoFillPlayers = gameServer.config.tourneyAutoFillPlayers;
    // Handles disconnections
    this.dcTime = gameServer.config.playerDisconnectTime;
    gameServer.config.playerDisconnectTime = 0;
    
    this.prepTime = gameServer.config.tourneyPrepTime;
    this.endTime = gameServer.config.tourneyEndTime;
    this.maxContenders = gameServer.config.tourneyMaxPlayers;
    
    // Time limit
    this.timeLimit = gameServer.config.tourneyTimeLimit * 60; // in seconds
};

Tournament.prototype.onPlayerDeath = function (gameServer) {
    // Nothing
};

Tournament.prototype.formatTime = function (time) {
    if (time < 0) {
        return "0:00";
    }
    // Format
    var min = Math.floor(this.timeLimit / 60);
    var sec = this.timeLimit % 60;
    sec = (sec > 9) ? sec : "0" + sec.toString();
    return min + ":" + sec;
};

// Override

Tournament.prototype.onServerInit = function (gameServer) {
    this.prepare(gameServer);
};

Tournament.prototype.onPlayerSpawn = function (gameServer, player) {
    // Bots from the previous round must not fill the lobby before humans join.
    if (!player.socket._socket && !this.hasEnoughPlayers()) {
        return;
    }
    // Only spawn players if the game hasnt started yet
    if ((this.gamePhase == 0) && (this.contenders.length < this.maxContenders)) {
        player.setColor(gameServer.getRandomColor()); // Random color
        this.contenders.push(player); // Add to contenders list
        gameServer.spawnPlayer(player);
        
        if (this.contenders.length == this.maxContenders) {
            // Start the game once there is enough players
            this.startGamePrep(gameServer);
        }
    }
};

Tournament.prototype.onCellRemove = function (cell) {
    var owner = cell.owner,
        human_just_died = false;
    
    if (owner.cells.length <= 0) {
        // Remove from contenders list
        var index = this.contenders.indexOf(owner);
        if (index != -1) {
            if ('_socket' in this.contenders[index].socket) {
                human_just_died = true;
            }
            this.contenders.splice(index, 1);
        }
        
        // Victory conditions
        var humans = 0;
        for (var i = 0; i < this.contenders.length; i++) {
            if ('_socket' in this.contenders[i].socket) {
                humans++;
            }
        }
        
        // the game is over if:
        // 1) there is only 1 player left, OR
        // 2) all the humans are dead, OR
        // 3) the last-but-one human just died
        if ((this.contenders.length == 1 || humans == 0 || (humans == 1 && human_just_died)) && this.gamePhase == 2) {
            this.endGame(cell.owner.gameServer);
        } else {
            // Do stuff
            this.onPlayerDeath(cell.owner.gameServer);
        }
    }
};

Tournament.prototype.updateLB = function (gameServer) {
    gameServer.leaderboardType = this.packetLB;
    var lb = gameServer.leaderboard;
    
    switch (this.gamePhase) {
        case 0:
            lb[0] = "Waiting for";
            lb[1] = "players: ";
            lb[2] = this.contenders.length + "/" + this.maxContenders;
            if (!this.hasEnoughPlayers()) {
                this.timer = gameServer.config.tourneyAutoFill;
            } else if (this.contenders.length == this.maxContenders) {
                this.startGamePrep(gameServer);
            } else if (this.autoFill) {
                if (this.timer <= 0) {
                    this.fillBots(gameServer);
                } else {
                    this.timer--;
                }
            }
            break;
        case 1:
            if (!this.hasEnoughPlayers()) {
                this.gamePhase = 0;
                this.timer = gameServer.config.tourneyAutoFill;
                this.updateLB(gameServer);
                return;
            }
            lb[0] = "Game starting in";
            lb[1] = this.timer.toString();
            lb[2] = "Good luck!";
            if (this.timer <= 0) {
                // Reset the game
                this.startGame(gameServer);
            } else {
                this.timer--;
            }
            break;
        case 2:
            lb[0] = "Players Remaining";
            lb[1] = this.contenders.length + "/" + this.maxContenders;
            lb[2] = "Time Limit:";
            lb[3] = this.formatTime(this.timeLimit);
            if (this.timeLimit < 0) {
                // Timed out
                this.endGameTimeout(gameServer);
            } else {
                this.timeLimit--;
            }
            break;
        case 3:
            lb[0] = "Congratulations";
            lb[1] = this.winner.getName();
            lb[2] = "for winning!";
            if (this.timer <= 0) {
                // Reset the game
                this.onServerInit(gameServer);
                // Respawn starting food
                gameServer.startingFood();
            } else {
                lb[3] = "Game restarting in";
                lb[4] = this.timer.toString();
                this.timer--;
            }
            break;
        case 4:
            lb[0] = "Time Limit";
            lb[1] = "Reached!";
            if (this.timer <= 0) {
                // Reset the game
                this.onServerInit(gameServer);
                // Respawn starting food
                gameServer.startingFood();
            } else {
                lb[2] = "Game restarting in";
                lb[3] = this.timer.toString();
                this.timer--;
            }
        default:
            break;
    }
};

