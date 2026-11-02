var Cell = require('../../entity/Cell');
var CellType = require('./CellType');

// Mode-local power-ups use the current Cell constructor and standard eating/boost hooks.
function PowerUp(gameServer, type, name, color) {
    Cell.call(this, gameServer, null, null, 78);
    this.cellType = type;
    this.name = name;
    this.setColor(color);
}
PowerUp.prototype = new Cell();

PowerUp.prototype.getName = function () {
    return this.name;
};

PowerUp.prototype.canEat = function (cell) {
    return cell.cellType === CellType.EJECTED_MASS;
};

// Feeding ejected mass pushes power-ups without increasing their size.
PowerUp.prototype.onEat = function (cell) {
    this.setBoost(300, cell.getAngle());
};

PowerUp.prototype.onAdd = function (gameServer) {
    var list = this.cellType === CellType.HERO ? gameServer.gameMode.heroes : gameServer.gameMode.brains;
    list.push(this);
};
PowerUp.prototype.onRemove = function (gameServer) {
    var list = this.cellType === CellType.HERO ? gameServer.gameMode.heroes : gameServer.gameMode.brains;
    var index = list.indexOf(this);
    if (index !== -1) {
        list.splice(index, 1);
    }
};

module.exports = PowerUp;

