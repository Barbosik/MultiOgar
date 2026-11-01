var MotherCell = require('../../entity/MotherCell');

// Reuse the current eating, food emission and virus-splitting implementation.
function TeamXMotherCell(gameServer, position, size) {
    MotherCell.call(this, gameServer, null, position, size);
    this.motherCellMinSize = size;
    this.setColor({ r: 205, g: 85, b: 100 });
}
TeamXMotherCell.prototype = Object.create(MotherCell.prototype);

TeamXMotherCell.prototype.onUpdate = function () {
    // Retain TeamX's passive growth without creating food from insufficient mass.
    this.setSize(Math.sqrt(this.getSizeSquared() + 0.25 * 0.25));
    var excess = Math.max(0, this.getSizeSquared() - this.motherCellMinSize * this.motherCellMinSize);
    var foodSize = this.gameServer.config.foodMinSize;
    // Emit at most ten pellets per update, funded by excess mass above the minimum size.
    this.motherCellSpawnAmount = foodSize > 0 ? Math.min(10, Math.floor(excess / (foodSize * foodSize))) : 0;
    MotherCell.prototype.onUpdate.call(this);
    this.gameServer.updateNodeQuad(this);
};

TeamXMotherCell.prototype.onAdd = function (gameServer) {
    gameServer.gameMode.nodesMother.push(this);
};

TeamXMotherCell.prototype.onRemove = function (gameServer) {
    var mothers = gameServer.gameMode.nodesMother;
    var index = mothers.indexOf(this);
    if (index !== -1) {
        mothers.splice(index, 1);
    }
};

module.exports = TeamXMotherCell;

