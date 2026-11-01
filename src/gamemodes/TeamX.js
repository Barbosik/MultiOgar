var Teams = require('./Teams');
var TeamXMotherCell = require('./entities/TeamXMotherCell');
var Virus = require('../entity/Virus');

function TeamX() {
    Teams.apply(this, Array.prototype.slice.call(arguments));

    this.ID = 14;
    this.name = 'Experimental Team';
    this.pushVirus = true; // Feeding pushes viruses; false restores normal growth and shooting.
    this.colorFuzziness = 72;
    this.motherCellMass = 200; // Mass, converted to cell size when spawning.
    this.motherUpdateInterval = 5; // Five ticks at 40 ms per tick.
    this.motherSpawnInterval = 25 * 5; // Five seconds.
    this.motherMinAmount = 5; // Target population, replenished by periodic spawn attempts.

    this.colors = [
        { r: 255, g: 7, b: 7 },
        { r: 7, g: 255, b: 7 },
        { r: 7, g: 7, b: 255 }
    ];
    this.nodesMother = [];
    this.tickMother = 0;
    this.tickMotherS = 0;
    this.virusHandlers = new WeakMap();
}

module.exports = TeamX;
TeamX.prototype = new Teams();

TeamX.prototype.fuzzColorComponent = function (component) {
    return component === 255 ? component : Math.floor(Math.random() * (this.colorFuzziness - 7)) + 7;
};

TeamX.prototype.spawnMotherCell = function (gameServer) {
    if (this.nodesMother.length >= this.motherMinAmount) {
        return;
    }
    var pos = gameServer.getRandomPosition();
    var size = Math.sqrt(this.motherCellMass * 100);
    if (gameServer.willCollide(pos, size)) {
        return;
    }
    gameServer.addNode(new TeamXMotherCell(gameServer, pos, size));
};

TeamX.prototype.updateMotherCells = function () {
    for (var i = 0; i < this.nodesMother.length; i++) {
        this.nodesMother[i].onUpdate();
    }
};

TeamX.prototype.onServerInit = function (gameServer) {
    this.onChange(gameServer);
    gameServer.run = true;
    // Reassign existing players and rebuild the inherited team-cell lists.
    Teams.prototype.onServerInit.call(this, gameServer);

    // Configure only this server's virus instances, including future CLI spawns.
    var mode = this;
    var addNode = gameServer.addNode;
    this.originalAddNode = addNode;
    this.addNodeOverride = function (node) {
        if (this.gameMode === mode && node instanceof Virus) {
            mode.prepareVirus(node);
        }
        return addNode.apply(this, arguments);
    };
    gameServer.addNode = this.addNodeOverride;
    for (var i = 0; i < gameServer.nodesVirus.length; i++) {
        this.prepareVirus(gameServer.nodesVirus[i]);
    }
};

TeamX.prototype.onChange = function (gameServer) {
    // Removing nodes also shrinks nodesMother through each mother's onRemove hook.
    while (this.nodesMother.length) {
        gameServer.removeNode(this.nodesMother[this.nodesMother.length - 1]);
    }
    for (var i = 0; i < gameServer.nodesVirus.length; i++) {
        var virus = gameServer.nodesVirus[i];
        if (!this.virusHandlers.has(virus)) {
            continue;
        }
        var descriptor = this.virusHandlers.get(virus);
        if (descriptor) {
            Object.defineProperty(virus, 'onEat', descriptor);
        } else {
            delete virus.onEat;
        }
    }
    if (gameServer.addNode === this.addNodeOverride) {
        gameServer.addNode = this.originalAddNode;
    }
    this.originalAddNode = null;
    this.addNodeOverride = null;
    this.virusHandlers = new WeakMap();
    this.tickMother = 0;
    this.tickMotherS = 0;
};

TeamX.prototype.onTick = function (gameServer) {
    if (++this.tickMother >= this.motherUpdateInterval) {
        this.tickMother = 0;
        this.updateMotherCells();
    }
    if (++this.tickMotherS >= this.motherSpawnInterval) {
        this.tickMotherS = 0;
        this.spawnMotherCell(gameServer);
    }
};

TeamX.prototype.prepareVirus = function (virus) {
    if (virus.isMotherCell || this.virusHandlers.has(virus)) {
        return;
    }
    this.virusHandlers.set(virus, Object.getOwnPropertyDescriptor(virus, 'onEat'));
    var mode = this;
    var onEat = virus.onEat;
    // Override only feeding: eating a virus still uses the standard player-splitting rules.
    virus.onEat = function (prey) {
        if (!mode.pushVirus) {
            return onEat.call(this, prey);
        }
        this.setBoost(320, prey.isMoving ? prey.getAngle() : this.getAngle());
    };
};

