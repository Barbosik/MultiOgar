var Mode = require('./Mode');

function Zombie() {
    Mode.apply(this, Array.prototype.slice.call(arguments));
    
    this.ID = 12;
    this.name = "Zombie FFA";
    this.haveTeams = true;
    this.zombieColor = {
        'r': 223,
        'g': 223,
        'b': 223
    };
    this.zombies = [];
    this.players = [];
}

module.exports = Zombie;
Zombie.prototype = new Mode();

// Gamemode Specific Functions

Zombie.prototype.leaderboardAddSort = function (player, leaderboard) {
    // Adds the player and sorts the leaderboard
    var len = leaderboard.length - 1;
    var loop = true;
    while ((len >= 0) && (loop)) {
        // Start from the bottom of the leaderboard
        if (player.getScore() <= leaderboard[len].getScore()) {
            leaderboard.splice(len + 1, 0, player);
            loop = false; // End the loop if a spot is found
        }
        len--;
    }
    if (loop) {
        // Add to top of the list because no spots were found
        leaderboard.splice(0, 0, player);
    }
};

Zombie.prototype.makeZombie = function (player) {
    if (player.getTeam() === 0) {
        return;
    }

    player.team = 0;
    player.setColor(this.zombieColor);

    // Move every cell from the human list to the zombie list.
    for (var i = 0; i < player.cells.length; i++) {
        var cell = player.cells[i];
        var index = this.players.indexOf(cell);
        if (index != -1) {
            this.players.splice(index, 1);
        }
        cell.setColor(this.zombieColor);
        this.zombies.push(cell);
    }
};

// Override

Zombie.prototype.onServerInit = function (gameServer) {
    gameServer.run = true;
    this.zombies = [];
    this.players = [];

    var initialZombie = null;
    for (var i = 0; i < gameServer.clients.length; i++) {
        var player = gameServer.clients[i].playerTracker;
        player.team = player.pID;
        player.setColor(gameServer.getRandomColor());

        for (var j = 0; j < player.cells.length; j++) {
            var cell = player.cells[j];
            cell.setColor(player.getColor());
            this.onCellAdd(cell);
        }

        if (initialZombie === null && player.cells.length > 0) {
            initialZombie = player;
        }
    }

    // Spectators do not count when selecting the initial zombie.
    if (initialZombie !== null) {
        this.makeZombie(initialZombie);
    }
};

Zombie.prototype.onPlayerSpawn = function (gameServer, player) {
    // make player a zombie if there are none
    if (this.zombies.length == 0) {
        player.team = 0;
        player.setColor(this.zombieColor);
    } else {
        // use player id as team so that bots are still able to fight (even though they probably turn into zombies very fast)
        player.team = player.pID;
        player.setColor(gameServer.getRandomColor());
    }
    
    // Spawn player
    gameServer.spawnPlayer(player);
};

Zombie.prototype.onCellAdd = function (cell) {
    // Add to team list
    if (cell.owner.getTeam() == 0) {
        this.zombies.push(cell);
    } else {
        this.players.push(cell);
    }
};

Zombie.prototype.onCellRemove = function (cell) {
    // Remove from team list
    if (cell.owner.getTeam() == 0) {
        var index = this.zombies.indexOf(cell);
        if (index != -1) {
            this.zombies.splice(index, 1);
        }
    } else {
        var index = this.players.indexOf(cell);
        if (index != -1) {
            this.players.splice(index, 1);
        }
    }
};

Zombie.prototype.onCellCollision = function (manifold) {
    var cell1 = manifold.cell1;
    var cell2 = manifold.cell2;
    if (cell1.isRemoved || cell2.isRemoved) {
        return;
    }
    if (cell1.cellType !== 0 || cell2.cellType !== 0) {
        return;
    }

    var player1 = cell1.owner;
    var player2 = cell2.owner;
    if (player1 === player2) {
        return;
    }

    var firstIsZombie = player1.getTeam() === 0;
    var secondIsZombie = player2.getTeam() === 0;
    if (firstIsZombie === secondIsZombie) {
        return;
    }

    var zombieCell = firstIsZombie ? cell1 : cell2;
    var humanCell = firstIsZombie ? cell2 : cell1;
    // Let eligible humans approach and eat zombies using the normal collision rules.
    if (humanCell.getSize() > zombieCell.getSize() * 1.15 && humanCell.canEat(zombieCell)) {
        return;
    }

    this.makeZombie(humanCell.owner);
};

Zombie.prototype.updateLB = function (gameServer) {
    gameServer.leaderboardType = this.packetLB;
    var lb = gameServer.leaderboard;
    // Loop through all clients
    for (var i = 0; i < gameServer.clients.length; i++) {
        if (typeof gameServer.clients[i] == "undefined" || gameServer.clients[i].playerTracker.team == 0) {
            continue;
        }
        
        var player = gameServer.clients[i].playerTracker;
        var playerScore = player.getScore();
        if (player.cells.length <= 0) {
            continue;
        }
        
        if (lb.length == 0) {
            // Initial player
            lb.push(player);
            continue;
        } else if (lb.length < 10) {
            this.leaderboardAddSort(player, lb);
        } else {
            // 10 in leaderboard already
            if (playerScore > lb[9].getScore()) {
                lb.pop();
                this.leaderboardAddSort(player, lb);
            }
        }
    }
    
    this.rankOne = lb[0];
};

