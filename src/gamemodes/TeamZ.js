var Mode = require('./Mode');
var Hero = require('./entities/Hero');
var Brain = require('./entities/Brain');

var TICKS_PER_SECOND = 25;
var GameState = { WF_PLAYERS: 0, WF_START: 1, IN_PROGRESS: 2 };
var CellType = require('./entities/CellType');

function TeamZ() {
    Mode.call(this);
    this.ID = 13;
    this.name = 'Zombie Team';
    this.packetLB = 48;
    this.haveTeams = true;

    // Living participants (including bots) required to begin the warm-up.
    this.minPlayer = 2;
    // Durations and spawn intervals use game ticks at 25 ticks per second.
    this.gameDuration = 15 * 60 * TICKS_PER_SECOND;
    this.warmUpDuration = 30 * TICKS_PER_SECOND;
    this.crazyDuration = 15 * TICKS_PER_SECOND; // Infection countdown before conversion unless cured.
    this.heroEffectDuration = 50 * TICKS_PER_SECOND;
    this.brainEffectDuration = 10 * TICKS_PER_SECOND;
    this.spawnBrainInterval = 60 * TICKS_PER_SECOND;
    this.spawnHeroInterval = 30 * TICKS_PER_SECOND;
    this.defaultColor = { r: 0x9b, g: 0x30, b: 0xff };

    this.colorFactorStep = 5;
    this.colorLower = 50;
    this.colorUpper = 225;
    this.maxBrain = -1; // A negative BRAIN limit follows the number of humans.
    this.maxHero = 4; // A negative HERO limit follows the number of zombies.

    this.state = GameState.WF_PLAYERS;
    this.winTeam = -1; // -1 = no result, 0 = zombies win, 1 = humans win.
    this.gameTimer = 0;
    // Team membership stores player trackers, not individual cells.
    this.zombies = [];
    this.humans = [];
    this.heroes = [];
    this.brains = [];
    this.spawnHeroTimer = 0;
    this.spawnBrainTimer = 0;
}

module.exports = TeamZ;
TeamZ.prototype = new Mode();

TeamZ.prototype.setPlayerColor = function (client, color) {
    client.setColor(color);
    for (var i = 0; i < client.cells.length; i++) {
        client.cells[i].setColor(color);
    }
};

TeamZ.prototype.createZColorFactor = function (client) {
    client.zColorFactor = Math.floor(Math.random() * (this.colorUpper - this.colorLower + 1)) + this.colorLower;
    client.zColorIncr = true;
};

TeamZ.prototype.nextZColorFactor = function (client) {
    var step = client.zColorIncr ? this.colorFactorStep : -this.colorFactorStep;
    client.zColorFactor = Math.max(this.colorLower, Math.min(this.colorUpper, client.zColorFactor + step));
    if (client.zColorFactor >= this.colorUpper) {
        client.zColorIncr = false;
    }
    if (client.zColorFactor <= this.colorLower) {
        client.zColorIncr = true;
    }
};

TeamZ.prototype.updateZColor = function (client, mask) {
    // RGB mask: 7 pulses all channels (gray); 5 pulses red/blue (BRAIN pink).
    this.setPlayerColor(client, {
        r: mask & 4 ? client.zColorFactor : 7,
        g: mask & 2 ? client.zColorFactor : 7,
        b: mask & 1 ? client.zColorFactor : 7
    });
};

TeamZ.prototype.isCrazy = function (client) {
    // "Crazy" humans are infected and move at double speed until the countdown ends.
    return client.team > 0 && client.crazyTimer > 0;
};

TeamZ.prototype.hasEatenHero = function (client) {
    return client.eatenHeroTimer > 0;
};

TeamZ.prototype.hasEatenBrain = function (client) {
    return client.eatenBrainTimer > 0;
};

TeamZ.prototype.boostSpeedCell = function (cell) {
    if (cell.originalSpeed) {
        return;
    }
    cell.originalSpeed = cell.getSpeed;
    cell.getSpeed = function () {
        return 2 * this.originalSpeed();
    };
};

TeamZ.prototype.boostSpeed = function (client) {
    for (var i = 0; i < client.cells.length; i++) {
        this.boostSpeedCell(client.cells[i]);
    }
};

TeamZ.prototype.resetSpeedCell = function (cell) {
    if (!cell.originalSpeed) {
        return;
    }
    cell.getSpeed = cell.originalSpeed;
    cell.originalSpeed = null;
};

TeamZ.prototype.resetSpeed = function (client) {
    for (var i = 0; i < client.cells.length; i++) {
        this.resetSpeedCell(client.cells[i]);
    }
};

TeamZ.prototype.resetPlayer = function (client) {
    this.resetSpeed(client);
    client.crazyTimer = 0;
    client.eatenHeroTimer = 0;
    client.eatenBrainTimer = 0;
    client.cured = false;
    client.colorToggle = 0;
    client.heroColorFactor = 0;
};

TeamZ.prototype.turnToZombie = function (client) {
    if (client.team === 0) {
        return;
    }
    this.resetPlayer(client);
    client.team = 0;
    this.createZColorFactor(client);
    this.updateZColor(client, 7);
    var index = this.humans.indexOf(client);
    if (index !== -1) {
        this.humans.splice(index, 1);
    }
    if (this.zombies.indexOf(client) === -1) {
        this.zombies.push(client);
    }
};

TeamZ.prototype.clearPowerUps = function (gameServer) {
    while (this.heroes.length) {
        gameServer.removeNode(this.heroes[this.heroes.length - 1]);
    }
    while (this.brains.length) {
        gameServer.removeNode(this.brains[this.brains.length - 1]);
    }
    this.spawnHeroTimer = 0;
    this.spawnBrainTimer = 0;
};

TeamZ.prototype.spawnDrug = function (gameServer, cell) {
    // Spawn a HERO or BRAIN only during a round and below its configured cap.
    var hero = cell.cellType === CellType.HERO;
    var nodes = hero ? this.heroes : this.brains;
    var max = hero ? this.maxHero : this.maxBrain;
    if (max < 0) {
        max = hero ? this.zombies.length : this.humans.length;
    }
    if (this.state !== GameState.IN_PROGRESS || nodes.length >= max) {
        return false;
    }

    // A crowded arena must never block the server in an endless retry loop.
    for (var attempt = 0; attempt < 10; attempt++) {
        var pos = gameServer.getRandomPosition();
        if (gameServer.willCollide(pos, cell.getSize())) {
            continue;
        }
        cell.setPosition(pos);
        gameServer.addNode(cell);
        return true;
    }
    return false;
};

TeamZ.prototype.startGame = function (gameServer) {
    if (this.humans.length < this.minPlayer) {
        return;
    }
    this.clearPowerUps(gameServer);
    for (var i = 0; i < this.humans.length; i++) {
        var client = this.humans[i];
        this.resetPlayer(client);
        // Humans have individual teams so they can eat one another; zombies share team 0.
        client.team = client.pID;
        this.setPlayerColor(client, gameServer.getRandomColor());
        for (var j = 0; j < client.cells.length; j++) {
            client.cells[j].setSize(gameServer.config.playerMinSize);
            gameServer.updateNodeQuad(client.cells[j]);
        }
    }
    // Select one living participant as the initial zombie.
    this.turnToZombie(this.humans[Math.floor(Math.random() * this.humans.length)]);
    this.winTeam = -1;
    this.state = GameState.IN_PROGRESS;
    this.gameTimer = this.gameDuration;
};

TeamZ.prototype.endGame = function (gameServer) {
    // Return living players to a shared lobby team; keep winTeam for the result display.
    this.clearPowerUps(gameServer);
    this.humans = [];
    this.zombies = [];
    for (var i = 0; i < gameServer.clients.length; i++) {
        var client = gameServer.clients[i].playerTracker;
        this.resetPlayer(client);
        client.team = 1;
        this.setPlayerColor(client, this.defaultColor);
        if (client.cells.length > 0) {
            this.humans.push(client);
        }
    }
    this.state = GameState.WF_PLAYERS;
    this.gameTimer = 0;
};

TeamZ.prototype.onServerInit = function (gameServer) {
    gameServer.run = true;
    this.endGame(gameServer);
    this.winTeam = -1;
};

TeamZ.prototype.onChange = function (gameServer) {
    // Remove mode-specific entities and effects before another gamemode takes over.
    this.clearPowerUps(gameServer);
    for (var i = 0; i < gameServer.clients.length; i++) {
        var client = gameServer.clients[i].playerTracker;
        this.resetPlayer(client);
        client.team = client.pID;
        this.setPlayerColor(client, gameServer.getRandomColor());
    }
    this.humans = [];
    this.zombies = [];
    this.state = GameState.WF_PLAYERS;
    this.gameTimer = 0;
    this.winTeam = -1;
};

TeamZ.prototype.onCellAdd = function (cell) {
    var client = cell.owner;
    // The first cell marks a spawn/respawn, not a split of an existing participant.
    if (client.cells.length === 1) {
        this.resetPlayer(client);
        client.team = client.pID;
        if (this.humans.indexOf(client) === -1) {
            this.humans.push(client);
        }
        if (this.state === GameState.IN_PROGRESS) {
            // Late joiners and respawning players join the zombie team.
            this.turnToZombie(client);
        } else {
            client.team = 1;
            this.setPlayerColor(client, this.defaultColor);
        }
    }
    // Covers normal splits, automatic splits and the current virus-splitting engine.
    if (this.isCrazy(client) || this.hasEatenBrain(client)) {
        this.boostSpeedCell(cell);
    }
};

TeamZ.prototype.onCellRemove = function (cell) {
    var client = cell.owner;
    if (client.cells.length > 0) {
        return;
    }
    var list = client.team === 0 ? this.zombies : this.humans;
    var index = list.indexOf(client);
    if (index !== -1) {
        list.splice(index, 1);
    }
    this.resetPlayer(client);
};

TeamZ.prototype.onCellCollision = function (manifold) {
    if (this.state !== GameState.IN_PROGRESS || !this.isRigidCollision(manifold)) {
        return;
    }
    var human = manifold.cell1.owner.team === 0 ? manifold.cell2.owner : manifold.cell1.owner;
    if (this.isCrazy(human)) {
        return;
    }
    human.crazyTimer = this.crazyDuration;
    human.cured = false;
    human.colorToggle = 0;
    this.boostSpeed(human);
};

TeamZ.prototype.isRigidCollision = function (manifold) {
    var cell1 = manifold.cell1;
    var cell2 = manifold.cell2;
    if (this.state !== GameState.IN_PROGRESS || cell1.isRemoved || cell2.isRemoved) {
        return false;
    }
    if (cell1.cellType !== CellType.PLAYER || cell2.cellType !== CellType.PLAYER) {
        return false;
    }
    if (cell1.owner === cell2.owner) {
        return false;
    }
    var firstIsZombie = cell1.owner.team === 0;
    var secondIsZombie = cell2.owner.team === 0;
    if (firstIsZombie === secondIsZombie) {
        return false;
    }
    var human = firstIsZombie ? cell2.owner : cell1.owner;
    // Unprotected contact infects and pushes cells apart instead of allowing eating.
    return !this.hasEatenHero(human);
};

TeamZ.prototype.canEat = function (cell, prey) {
    if (this.state !== GameState.IN_PROGRESS) {
        return false;
    }
    if (cell.cellType === CellType.HERO || cell.cellType === CellType.BRAIN) {
        return prey.cellType === CellType.EJECTED_MASS;
    }
    if (!cell.owner) {
        return true;
    }
    // HERO is human-only; BRAIN is zombie-only. Normal size/range checks still apply.
    if (prey.cellType === CellType.HERO) {
        return cell.owner.team !== 0;
    }
    if (prey.cellType === CellType.BRAIN) {
        return cell.owner.team === 0;
    }
    if (prey.owner && prey.owner !== cell.owner && (cell.owner.team === 0) !== (prey.owner.team === 0)) {
        var human = cell.owner.team === 0 ? prey.owner : cell.owner;
        return this.hasEatenHero(human);
    }
    return true;
};

TeamZ.prototype.updateHuman = function (client) {
    if (this.isCrazy(client)) {
        client.crazyTimer--;
        if (client.crazyTimer === 0) {
            this.resetSpeed(client);
            if (!client.cured) {
                this.turnToZombie(client);
                return;
            }
            client.cured = false;
            this.setPlayerColor(client, client.getColor());
        } else {
            client.colorToggle = (client.colorToggle + 1) % 20;
            var color = client.colorToggle < 10 ? client.getColor() :
                client.cured ? { r: 255, g: 255, b: 7 } : { r: 75, g: 75, b: 75 };
            // Keep the normal human color for restoration after the effect ends.
            for (var i = 0; i < client.cells.length; i++) {
                client.cells[i].setColor(color);
            }
        }
    } else if (this.hasEatenHero(client)) {
        client.eatenHeroTimer--;
        client.heroColorFactor = (client.heroColorFactor + 5) % 400;
        var factor = client.heroColorFactor;
        var color = client.eatenHeroTimer > 0 ?
            { r: 255, g: 255, b: factor <= 200 ? factor : 400 - factor } : client.getColor();
        for (var i = 0; i < client.cells.length; i++) {
            client.cells[i].setColor(color);
        }
    }
};

TeamZ.prototype.onTick = function (gameServer) {
    if (this.state === GameState.WF_PLAYERS) {
        if (this.humans.length >= this.minPlayer) {
            this.state = GameState.WF_START;
            this.gameTimer = this.warmUpDuration;
        }
        return;
    }
    if (this.state === GameState.WF_START) {
        if (this.humans.length < this.minPlayer) {
            this.state = GameState.WF_PLAYERS;
            this.gameTimer = 0;
        } else if (--this.gameTimer <= 0) {
            this.startGame(gameServer);
        }
        return;
    }

    this.gameTimer--;
    for (var i = 0; i < this.zombies.length; i++) {
        var client = this.zombies[i];
        this.nextZColorFactor(client);
        if (this.hasEatenBrain(client) && --client.eatenBrainTimer === 0) {
            this.resetSpeed(client);
        }
        this.updateZColor(client, this.hasEatenBrain(client) ? 5 : 7);
    }
    // Conversion removes clients from humans; a snapshot avoids skipping the next human.
    var humans = this.humans.slice();
    for (var i = 0; i < humans.length; i++) {
        this.updateHuman(humans[i]);
    }

    // Humans win by surviving the timer or eliminating zombies; zombies win by conversion/elimination.
    if (this.gameTimer <= 0) {
        this.winTeam = 1;
    } else if (this.humans.length === 0) {
        this.winTeam = 0;
    } else if (this.zombies.length === 0) {
        this.winTeam = 1;
    }
    if (this.winTeam >= 0) {
        this.endGame(gameServer);
        return;
    }

    if (++this.spawnHeroTimer >= this.spawnHeroInterval) {
        this.spawnHeroTimer = 0;
        this.spawnDrug(gameServer, new Hero(gameServer));
    }
    if (++this.spawnBrainTimer >= this.spawnBrainInterval) {
        this.spawnBrainTimer = 0;
        this.spawnDrug(gameServer, new Brain(gameServer));
    }
};

function formatTime(ticks) {
    var seconds = Math.max(0, Math.ceil(ticks / TICKS_PER_SECOND));
    var minutes = Math.floor(seconds / 60);
    seconds %= 60;
    return (minutes < 10 ? '0' : '') + minutes + ':' + (seconds < 10 ? '0' : '') + seconds;
}

TeamZ.prototype.updateLB = function (gameServer) {
    gameServer.leaderboardType = this.packetLB;
    var lb = gameServer.leaderboard;
    if (this.winTeam >= 0) {
        lb.push(this.winTeam === 0 ? 'ZOMBIE WINS' : 'HUMAN WINS');
        lb.push('_______________');
    }
    if (this.state === GameState.WF_PLAYERS) {
        lb.push('WAITING FOR', 'PLAYERS...', this.humans.length + '/' + this.minPlayer);
    } else if (this.state === GameState.WF_START) {
        lb.push('GAME STARTS IN:', formatTime(this.gameTimer));
    } else {
        lb.push(formatTime(this.gameTimer), 'HUMAN: ' + this.humans.length,
            'ZOMBIE: ' + this.zombies.length, '_______________');
        var leaders = this.humans.slice().sort(function (a, b) { return b.getScore() - a.getScore(); });
        for (var i = 0; i < leaders.length && lb.length < 10; i++) {
            lb.push(leaders[i].getName());
        }
    }
};

