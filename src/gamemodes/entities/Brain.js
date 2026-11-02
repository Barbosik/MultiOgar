var PowerUp = require('./PowerUp');
var CellType = require('./CellType');

function Brain(gameServer) {
    PowerUp.call(this, gameServer, CellType.BRAIN, 'BRAIN', { r: 255, g: 7, b: 255 });
}
Brain.prototype = Object.create(PowerUp.prototype);
Brain.prototype.onEaten = function (consumer) {
    var client = consumer.owner;
    var mode = this.gameServer.gameMode;
    // BRAIN refreshes the zombie's double-speed effect; it does not stack multipliers.
    client.eatenBrainTimer = mode.brainEffectDuration;
    mode.boostSpeed(client);
};

module.exports = Brain;

