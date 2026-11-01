var Tournament = require('./Tournament');
var Entity = require('../entity');
var QuadNode = require('quad-node');
var Packet = require('../packet');

function HungerGames() {
    Tournament.apply(this, Array.prototype.slice.call(arguments));
    
    this.ID = 11;
    this.name = "Hunger Games";
    
    // Gamemode Specific Variables
    this.maxContenders = 12;
    this.baseSpawnPoints = [{
            x: 1600,
            y: 200
        }, {
            x: 3200,
            y: 200
        }, {
            x: 4800,
            y: 200
        }, // Top
        {
            x: 200,
            y: 1600
        }, {
            x: 200,
            y: 3200
        }, {
            x: 200,
            y: 4800
        }, // Left
        {
            x: 6200,
            y: 1600
        }, {
            x: 6200,
            y: 3200
        }, {
            x: 6200,
            y: 4800
        }, // Right
        {
            x: 1600,
            y: 6200
        }, {
            x: 3200,
            y: 6200
        }, {
            x: 4800,
            y: 6200
        } // Bottom
    ];
    this.contenderSpawnPoints;
    this.borderDec = 200; // Border shrinks by this size everytime someone dies
}

module.exports = HungerGames;
HungerGames.prototype = new Tournament();

// Gamemode Specific Functions

HungerGames.prototype.getPos = function (gameServer, player) {
    var pos = {
        x: 3200,
        y: 3200
    };
    
    // Random Position
    if (this.contenderSpawnPoints.length > 0) {
        var index = Math.floor(Math.random() * this.contenderSpawnPoints.length);
        pos = this.contenderSpawnPoints[index];
        this.contenderSpawnPoints.splice(index, 1);
        player.hungerGamesSpawnPoint = pos;
    }
    
    return {
        // The original spawn layout uses coordinates from 0 to 6400.
        x: gameServer.border.minx + pos.x / 6400 * gameServer.border.width,
        y: gameServer.border.miny + pos.y / 6400 * gameServer.border.height
    };
};

HungerGames.prototype.spawnFood = function (gameServer, mass, pos) {
    pos = { x: gameServer.border.minx + pos.x, y: gameServer.border.miny + pos.y };
    var cell = new Entity.Food(gameServer, null, pos, mass);
    cell.setColor(gameServer.getRandomColor());
    gameServer.addNode(cell);
};

HungerGames.prototype.spawnVirus = function (gameServer, pos) {
    pos = { x: gameServer.border.minx + pos.x, y: gameServer.border.miny + pos.y };
    var v = new Entity.Virus(gameServer, null, pos, gameServer.config.virusMinSize);
    gameServer.addNode(v);
};

HungerGames.prototype.onPlayerDeath = function (gameServer) {
    if (this.gamePhase != 2) {
        return;
    }
    gameServer.setBorder(
        gameServer.border.width - this.borderDec * 2, 
        gameServer.border.height - this.borderDec * 2);

    if (gameServer.config.serverScrambleLevel < 2) {
        for (var i = 0; i < gameServer.clients.length; i++) {
            var player = gameServer.clients[i].playerTracker;
            player.socket.sendPacket(new Packet.SetBorder(player, gameServer.border));
        }
    }
    
    // Remove all cells
    var len = gameServer.nodes.length;
    for (var i = 0; i < len; i++) {
        var node = gameServer.nodes[i];
        
        if ((!node) || (node.getType() == 0)) {
            continue;
        }
        
        // Move
        if (node.position.x < gameServer.border.minx) {
            gameServer.removeNode(node);
            i--;
        } else if (node.position.x > gameServer.border.maxx) {
            gameServer.removeNode(node);
            i--;
        } else if (node.position.y < gameServer.border.miny) {
            gameServer.removeNode(node);
            i--;
        } else if (node.position.y > gameServer.border.maxy) {
            gameServer.removeNode(node);
            i--;
        }
    }
};

// Override

HungerGames.prototype.onServerInit = function (gameServer) {
    // Prepare
    gameServer.config.playerDisconnectTime = 10; // Do not let disconnected players stall the match
    this.prepare(gameServer);
    
    // Resets spawn points
    this.contenderSpawnPoints = this.baseSpawnPoints.slice();
    this.maxContenders = Math.min(this.maxContenders, this.contenderSpawnPoints.length);
    
    // Override config values
    if (gameServer.config.serverBots > this.maxContenders) {
        // The number of bots cannot exceed the maximum amount of contenders
        gameServer.config.serverBots = this.maxContenders;
    }
    gameServer.config.spawnInterval = 20;
    gameServer.config.borderWidth = 6400;
    gameServer.config.borderHeight = 6400;
    gameServer.setBorder(gameServer.config.borderWidth, gameServer.config.borderHeight);
    gameServer.quadTree = new QuadNode(gameServer.border, 64, 32);
    gameServer.config.foodSpawnAmount = 20; // This is hunger games
    gameServer.config.foodMinAmount = 400;
    gameServer.config.foodMaxAmount = 800;
    gameServer.config.foodMinSize = 10; // Food is scarce, but its worth more
    gameServer.config.virusMinAmount = 10; // We need to spawn some viruses in case someone eats them all
    gameServer.config.virusMaxAmount = 100;
    gameServer.config.ejectSpawnPlayer = 0;
    
    // Spawn Initial Virus/Large food
    var mapWidth = gameServer.border.width;
    var mapHeight = gameServer.border.height;
    
    // Food
    this.spawnFood(gameServer, 200, {
        x: mapWidth * .5,
        y: mapHeight * .5
    }); // Center
    this.spawnFood(gameServer, 80, {
        x: mapWidth * .4,
        y: mapHeight * .6
    }); //
    this.spawnFood(gameServer, 80, {
        x: mapWidth * .6,
        y: mapHeight * .6
    });
    this.spawnFood(gameServer, 80, {
        x: mapWidth * .4,
        y: mapHeight * .4
    });
    this.spawnFood(gameServer, 80, {
        x: mapWidth * .6,
        y: mapHeight * .4
    });
    this.spawnFood(gameServer, 50, {
        x: mapWidth * .7,
        y: mapHeight * .5
    }); //
    this.spawnFood(gameServer, 50, {
        x: mapWidth * .3,
        y: mapHeight * .5
    });
    this.spawnFood(gameServer, 50, {
        x: mapWidth * .5,
        y: mapHeight * .7
    });
    this.spawnFood(gameServer, 50, {
        x: mapWidth * .5,
        y: mapHeight * .3
    });
    this.spawnFood(gameServer, 30, {
        x: mapWidth * .7,
        y: mapHeight * .625
    }); // Corner
    this.spawnFood(gameServer, 30, {
        x: mapWidth * .625,
        y: mapHeight * .7
    });
    this.spawnFood(gameServer, 30, {
        x: mapWidth * .3,
        y: mapHeight * .4
    });
    this.spawnFood(gameServer, 30, {
        x: mapWidth * .4,
        y: mapHeight * .3
    });
    this.spawnFood(gameServer, 30, {
        x: mapWidth * .6,
        y: mapHeight * .3
    });
    this.spawnFood(gameServer, 30, {
        x: mapWidth * .7,
        y: mapHeight * .4
    });
    this.spawnFood(gameServer, 30, {
        x: mapWidth * .3,
        y: mapHeight * .6
    });
    this.spawnFood(gameServer, 30, {
        x: mapWidth * .4,
        y: mapHeight * .7
    });
    
    // Virus
    this.spawnVirus(gameServer, {
        x: mapWidth * .6,
        y: mapHeight * .5
    }); //
    this.spawnVirus(gameServer, {
        x: mapWidth * .4,
        y: mapHeight * .5
    });
    this.spawnVirus(gameServer, {
        x: mapWidth * .5,
        y: mapHeight * .4
    });
    this.spawnVirus(gameServer, {
        x: mapWidth * .5,
        y: mapHeight * .6
    });
    this.spawnVirus(gameServer, {
        x: mapWidth * .3,
        y: mapHeight * .3
    }); //
    this.spawnVirus(gameServer, {
        x: mapWidth * .3,
        y: mapHeight * .7
    });
    this.spawnVirus(gameServer, {
        x: mapWidth * .7,
        y: mapHeight * .3
    });
    this.spawnVirus(gameServer, {
        x: mapWidth * .7,
        y: mapHeight * .7
    });
    this.spawnVirus(gameServer, {
        x: mapWidth * .25,
        y: mapHeight * .6
    }); //
    this.spawnVirus(gameServer, {
        x: mapWidth * .25,
        y: mapHeight * .4
    });
    this.spawnVirus(gameServer, {
        x: mapWidth * .75,
        y: mapHeight * .6
    });
    this.spawnVirus(gameServer, {
        x: mapWidth * .75,
        y: mapHeight * .4
    });
    this.spawnVirus(gameServer, {
        x: mapWidth * .6,
        y: mapHeight * .25
    });
    this.spawnVirus(gameServer, {
        x: mapWidth * .4,
        y: mapHeight * .25
    });
    this.spawnVirus(gameServer, {
        x: mapWidth * .6,
        y: mapHeight * .75
    });
    this.spawnVirus(gameServer, {
        x: mapWidth * .4,
        y: mapHeight * .75
    });
};

HungerGames.prototype.onPlayerSpawn = function (gameServer, player) {
    if (!player.socket._socket && !this.hasEnoughPlayers()) {
        return;
    }
    // Only spawn players if the game hasnt started yet
    if ((this.gamePhase == 0) && (this.contenders.length < this.maxContenders)) {
        player.setColor(gameServer.getRandomColor()); // Random color
        this.contenders.push(player); // Add to contenders list
        gameServer.spawnPlayer(player, this.getPos(gameServer, player));
        
        if (this.contenders.length == this.maxContenders) {
            // Start the game once there is enough players
            this.startGamePrep(gameServer);
        }
    }
};

HungerGames.prototype.onCellRemove = function (cell) {
    var owner = cell.owner;
    if (owner.cells.length == 0 && owner.hungerGamesSpawnPoint) {
        if (this.gamePhase == 0 || this.gamePhase == 1) {
            this.contenderSpawnPoints.push(owner.hungerGamesSpawnPoint);
        }
        owner.hungerGamesSpawnPoint = null;
    }
    Tournament.prototype.onCellRemove.call(this, cell);
};

