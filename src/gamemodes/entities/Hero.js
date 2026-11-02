var PowerUp = require('./PowerUp');
var CellType = require('./CellType');

function Hero(gameServer) {
    PowerUp.call(this, gameServer, CellType.HERO, 'HERO', { r: 255, g: 255, b: 7 });
}
Hero.prototype = Object.create(PowerUp.prototype);
Hero.prototype.onEaten = function (consumer) {
    var client = consumer.owner;
    var mode = this.gameServer.gameMode;
    // Cure a pending infection, or grant timed protection to an uninfected human.
    // A cure prevents conversion when the current infection countdown expires.
    if (mode.isCrazy(client)) {
        client.cured = true;
    } else {
        client.eatenHeroTimer = mode.heroEffectDuration;
        client.heroColorFactor = 0;
    }
};

module.exports = Hero;

