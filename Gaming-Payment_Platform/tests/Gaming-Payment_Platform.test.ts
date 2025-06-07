import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock Clarity contract environment
const mockContract = {
  // Mock data variables
  platformBalance: 0,
  totalRewardsDistributed: 0,
  gameIdCounter: 0,
  tournamentIdCounter: 0,
  itemIdCounter: 0,
  platformPaused: false,
  
  // Mock data maps
  players: new Map(),
  games: new Map(),
  playerGames: new Map(),
  gameItems: new Map(),
  playerItems: new Map(),
  tournaments: new Map(),
  tournamentParticipants: new Map(),
  
  // Mock constants
  CONTRACT_OWNER: 'SP1234567890ABCDEF',
  PLATFORM_FEE_RATE: 250, // 2.5%
  MIN_PAYMENT: 100000, // 0.1 STX
  MAX_REWARD_MULTIPLIER: 1000,
  TOURNAMENT_ENTRY_FEE: 1000000, // 1 STX
  
  // Mock current time
  getCurrentTime: () => Date.now(),
  
  // Mock STX transfer
  stxTransfer: vi.fn().mockResolvedValue({ success: true }),
  
  // Helper functions
  calculatePlatformFee: (amount) => Math.floor((amount * 250) / 10000),
  calculateExpPoints: (amount) => Math.floor(amount / 10000),
  calculateLevel: (expPoints) => {
    if (expPoints <= 1000) return 1;
    if (expPoints <= 5000) return 2;
    if (expPoints <= 15000) return 3;
    if (expPoints <= 35000) return 4;
    if (expPoints <= 75000) return 5;
    return 6;
  },
  isValidPayment: (amount) => amount >= 100000,
  
  // Reset function for tests
  reset: function() {
    this.platformBalance = 0;
    this.totalRewardsDistributed = 0;
    this.gameIdCounter = 0;
    this.tournamentIdCounter = 0;
    this.itemIdCounter = 0;
    this.platformPaused = false;
    this.players.clear();
    this.games.clear();
    this.playerGames.clear();
    this.gameItems.clear();
    this.playerItems.clear();
    this.tournaments.clear();
    this.tournamentParticipants.clear();
  }
};

// Contract functions implementation
const contractFunctions = {
  // Player registration
  registerPlayer: (txSender) => {
    if (mockContract.platformPaused) {
      return { error: 'ERR_NOT_AUTHORIZED' };
    }
    
    if (mockContract.players.has(txSender)) {
      return { error: 'ERR_ALREADY_REGISTERED' };
    }
    
    mockContract.players.set(txSender, {
      balance: 0,
      totalSpent: 0,
      totalEarned: 0,
      experiencePoints: 0,
      level: 1,
      isActive: true,
      registrationTime: mockContract.getCurrentTime()
    });
    
    return { success: true };
  },
  
  // Deposit funds
  depositFunds: (txSender, amount) => {
    if (mockContract.platformPaused) {
      return { error: 'ERR_NOT_AUTHORIZED' };
    }
    
    const player = mockContract.players.get(txSender);
    if (!player) {
      return { error: 'ERR_PLAYER_NOT_FOUND' };
    }
    
    if (!mockContract.isValidPayment(amount)) {
      return { error: 'ERR_INVALID_AMOUNT' };
    }
    
    if (!player.isActive) {
      return { error: 'ERR_NOT_AUTHORIZED' };
    }
    
    // Mock STX transfer
    mockContract.stxTransfer(amount, txSender, 'contract');
    
    player.balance += amount;
    return { success: amount };
  },
  
  // Withdraw funds
  withdrawFunds: (txSender, amount) => {
    if (mockContract.platformPaused) {
      return { error: 'ERR_NOT_AUTHORIZED' };
    }
    
    const player = mockContract.players.get(txSender);
    if (!player) {
      return { error: 'ERR_PLAYER_NOT_FOUND' };
    }
    
    if (!player.isActive) {
      return { error: 'ERR_NOT_AUTHORIZED' };
    }
    
    if (amount > player.balance) {
      return { error: 'ERR_INSUFFICIENT_BALANCE' };
    }
    
    // Mock STX transfer
    mockContract.stxTransfer(amount, 'contract', txSender);
    
    player.balance -= amount;
    return { success: amount };
  },
  
  // Register game
  registerGame: (txSender, name, price) => {
    if (mockContract.platformPaused) {
      return { error: 'ERR_NOT_AUTHORIZED' };
    }
    
    if (!mockContract.isValidPayment(price)) {
      return { error: 'ERR_INVALID_AMOUNT' };
    }
    
    const newGameId = ++mockContract.gameIdCounter;
    mockContract.games.set(newGameId, {
      name,
      developer: txSender,
      price,
      rewardPool: 0,
      isActive: true,
      createdAt: mockContract.getCurrentTime(),
      totalPlayers: 0
    });
    
    return { success: newGameId };
  },
  
  // Purchase game
  purchaseGame: (txSender, gameId) => {
    if (mockContract.platformPaused) {
      return { error: 'ERR_NOT_AUTHORIZED' };
    }
    
    const player = mockContract.players.get(txSender);
    if (!player) {
      return { error: 'ERR_PLAYER_NOT_FOUND' };
    }
    
    const game = mockContract.games.get(gameId);
    if (!game) {
      return { error: 'ERR_GAME_NOT_FOUND' };
    }
    
    if (!game.isActive) {
      return { error: 'ERR_GAME_NOT_FOUND' };
    }
    
    if (!player.isActive) {
      return { error: 'ERR_NOT_AUTHORIZED' };
    }
    
    if (game.price > player.balance) {
      return { error: 'ERR_INSUFFICIENT_BALANCE' };
    }
    
    const playerGameKey = `${txSender}-${gameId}`;
    if (mockContract.playerGames.has(playerGameKey)) {
      return { error: 'ERR_ALREADY_REGISTERED' };
    }
    
    const platformFee = mockContract.calculatePlatformFee(game.price);
    const developerPayment = game.price - platformFee;
    const expPoints = mockContract.calculateExpPoints(game.price);
    
    // Update player
    player.balance -= game.price;
    player.totalSpent += game.price;
    player.experiencePoints += expPoints;
    player.level = mockContract.calculateLevel(player.experiencePoints);
    
    // Record game ownership
    mockContract.playerGames.set(playerGameKey, {
      purchasedAt: mockContract.getCurrentTime(),
      playtime: 0,
      highScore: 0,
      achievements: 0
    });
    
    // Update game stats
    game.totalPlayers += 1;
    
    // Handle payments
    mockContract.stxTransfer(developerPayment, 'contract', game.developer);
    mockContract.platformBalance += platformFee;
    
    return { success: true };
  },
  
  // Create tournament
  createTournament: (txSender, gameId, name, entryFee, maxParticipants, duration) => {
    if (mockContract.platformPaused) {
      return { error: 'ERR_NOT_AUTHORIZED' };
    }
    
    const game = mockContract.games.get(gameId);
    if (!game) {
      return { error: 'ERR_GAME_NOT_FOUND' };
    }
    
    if (txSender !== game.developer) {
      return { error: 'ERR_NOT_AUTHORIZED' };
    }
    
    if (!game.isActive) {
      return { error: 'ERR_GAME_NOT_FOUND' };
    }
    
    if (maxParticipants <= 1) {
      return { error: 'ERR_INVALID_AMOUNT' };
    }
    
    if (duration <= 0) {
      return { error: 'ERR_INVALID_AMOUNT' };
    }
    
    const newTournamentId = ++mockContract.tournamentIdCounter;
    const currentTime = mockContract.getCurrentTime();
    
    mockContract.tournaments.set(newTournamentId, {
      gameId,
      name,
      entryFee,
      prizePool: 0,
      maxParticipants,
      currentParticipants: 0,
      startTime: currentTime,
      endTime: currentTime + duration,
      isActive: true,
      winner: null
    });
    
    return { success: newTournamentId };
  },
  
  // Join tournament
  joinTournament: (txSender, tournamentId) => {
    if (mockContract.platformPaused) {
      return { error: 'ERR_NOT_AUTHORIZED' };
    }
    
    const player = mockContract.players.get(txSender);
    if (!player) {
      return { error: 'ERR_PLAYER_NOT_FOUND' };
    }
    
    const tournament = mockContract.tournaments.get(tournamentId);
    if (!tournament) {
      return { error: 'ERR_TOURNAMENT_NOT_FOUND' };
    }
    
    if (!player.isActive) {
      return { error: 'ERR_NOT_AUTHORIZED' };
    }
    
    if (!tournament.isActive) {
      return { error: 'ERR_TOURNAMENT_NOT_FOUND' };
    }
    
    const currentTime = mockContract.getCurrentTime();
    if (currentTime >= tournament.endTime) {
      return { error: 'ERR_TOURNAMENT_ENDED' };
    }
    
    if (tournament.currentParticipants >= tournament.maxParticipants) {
      return { error: 'ERR_TOURNAMENT_ENDED' };
    }
    
    if (tournament.entryFee > player.balance) {
      return { error: 'ERR_INSUFFICIENT_BALANCE' };
    }
    
    const participantKey = `${tournamentId}-${txSender}`;
    if (mockContract.tournamentParticipants.has(participantKey)) {
      return { error: 'ERR_ALREADY_REGISTERED' };
    }
    
    // Update player balance
    player.balance -= tournament.entryFee;
    player.totalSpent += tournament.entryFee;
    
    // Register participation
    mockContract.tournamentParticipants.set(participantKey, {
      entryTime: currentTime,
      score: 0,
      rank: 0,
      prizeClaimed: false
    });
    
    // Update tournament
    tournament.prizePool += tournament.entryFee;
    tournament.currentParticipants += 1;
    
    return { success: true };
  },
  
  // Get player profile
  getPlayerProfile: (player) => {
    return mockContract.players.get(player) || null;
  },
  
  // Get game details
  getGameDetails: (gameId) => {
    return mockContract.games.get(gameId) || null;
  },
  
  // Get tournament details
  getTournamentDetails: (tournamentId) => {
    return mockContract.tournaments.get(tournamentId) || null;
  },
  
  // Get platform stats
  getPlatformStats: () => {
    return {
      platformBalance: mockContract.platformBalance,
      totalRewardsDistributed: mockContract.totalRewardsDistributed,
      totalGames: mockContract.gameIdCounter,
      totalTournaments: mockContract.tournamentIdCounter,
      totalItems: mockContract.itemIdCounter,
      isPaused: mockContract.platformPaused
    };
  },
  
  // Emergency pause
  emergencyPause: (txSender) => {
    if (txSender !== mockContract.CONTRACT_OWNER) {
      return { error: 'ERR_NOT_AUTHORIZED' };
    }
    mockContract.platformPaused = true;
    return { success: true };
  },
  
  // Resume operations
  resumeOperations: (txSender) => {
    if (txSender !== mockContract.CONTRACT_OWNER) {
      return { error: 'ERR_NOT_AUTHORIZED' };
    }
    mockContract.platformPaused = false;
    return { success: true };
  }
};

describe('Gaming Payment & Rewards Platform Smart Contract', () => {
  beforeEach(() => {
    mockContract.reset();
  });

  describe('Player Registration', () => {
    it('should register a new player successfully', () => {
      const result = contractFunctions.registerPlayer('SP1PLAYER1');
      expect(result.success).toBe(true);
      
      const player = contractFunctions.getPlayerProfile('SP1PLAYER1');
      expect(player).toBeTruthy();
      expect(player.balance).toBe(0);
      expect(player.level).toBe(1);
      expect(player.isActive).toBe(true);
    });

    it('should prevent duplicate player registration', () => {
      contractFunctions.registerPlayer('SP1PLAYER1');
      const result = contractFunctions.registerPlayer('SP1PLAYER1');
      expect(result.error).toBe('ERR_ALREADY_REGISTERED');
    });

    it('should prevent registration when platform is paused', () => {
      contractFunctions.emergencyPause(mockContract.CONTRACT_OWNER);
      const result = contractFunctions.registerPlayer('SP1PLAYER1');
      expect(result.error).toBe('ERR_NOT_AUTHORIZED');
    });
  });

  describe('Fund Management', () => {
    beforeEach(() => {
      contractFunctions.registerPlayer('SP1PLAYER1');
    });

    it('should allow players to deposit funds', () => {
      const result = contractFunctions.depositFunds('SP1PLAYER1', 1000000);
      expect(result.success).toBe(1000000);
      
      const player = contractFunctions.getPlayerProfile('SP1PLAYER1');
      expect(player.balance).toBe(1000000);
    });

    it('should reject deposits below minimum amount', () => {
      const result = contractFunctions.depositFunds('SP1PLAYER1', 50000);
      expect(result.error).toBe('ERR_INVALID_AMOUNT');
    });

    it('should allow players to withdraw funds', () => {
      contractFunctions.depositFunds('SP1PLAYER1', 1000000);
      const result = contractFunctions.withdrawFunds('SP1PLAYER1', 500000);
      expect(result.success).toBe(500000);
      
      const player = contractFunctions.getPlayerProfile('SP1PLAYER1');
      expect(player.balance).toBe(500000);
    });

    it('should prevent withdrawal of more than available balance', () => {
      contractFunctions.depositFunds('SP1PLAYER1', 1000000);
      const result = contractFunctions.withdrawFunds('SP1PLAYER1', 1500000);
      expect(result.error).toBe('ERR_INSUFFICIENT_BALANCE');
    });

    it('should prevent operations for non-existent players', () => {
      const result = contractFunctions.depositFunds('SP1NONEXISTENT', 1000000);
      expect(result.error).toBe('ERR_PLAYER_NOT_FOUND');
    });
  });

  describe('Game Management', () => {
    beforeEach(() => {
      contractFunctions.registerPlayer('SP1DEVELOPER');
      contractFunctions.registerPlayer('SP1PLAYER1');
      contractFunctions.depositFunds('SP1PLAYER1', 5000000);
    });

    it('should register a new game successfully', () => {
      const result = contractFunctions.registerGame('SP1DEVELOPER', 'Test Game', 1000000);
      expect(result.success).toBe(1);
      
      const game = contractFunctions.getGameDetails(1);
      expect(game).toBeTruthy();
      expect(game.name).toBe('Test Game');
      expect(game.developer).toBe('SP1DEVELOPER');
      expect(game.price).toBe(1000000);
    });

    it('should reject game registration with invalid price', () => {
      const result = contractFunctions.registerGame('SP1DEVELOPER', 'Test Game', 50000);
      expect(result.error).toBe('ERR_INVALID_AMOUNT');
    });

    it('should allow players to purchase games', () => {
      contractFunctions.registerGame('SP1DEVELOPER', 'Test Game', 1000000);
      const result = contractFunctions.purchaseGame('SP1PLAYER1', 1);
      expect(result.success).toBe(true);
      
      const player = contractFunctions.getPlayerProfile('SP1PLAYER1');
      expect(player.balance).toBe(4000000); // 5M - 1M
      expect(player.totalSpent).toBe(1000000);
      expect(player.experiencePoints).toBe(100); // 1M / 10000
    });

    it('should prevent duplicate game purchases', () => {
      contractFunctions.registerGame('SP1DEVELOPER', 'Test Game', 1000000);
      contractFunctions.purchaseGame('SP1PLAYER1', 1);
      const result = contractFunctions.purchaseGame('SP1PLAYER1', 1);
      expect(result.error).toBe('ERR_ALREADY_REGISTERED');
    });

    it('should prevent purchase with insufficient funds', () => {
      contractFunctions.registerGame('SP1DEVELOPER', 'Expensive Game', 6000000);
      const result = contractFunctions.purchaseGame('SP1PLAYER1', 1);
      expect(result.error).toBe('ERR_INSUFFICIENT_BALANCE');
    });

    it('should calculate and distribute platform fees correctly', () => {
      const gamePrice = 1000000;
      const expectedFee = mockContract.calculatePlatformFee(gamePrice);
      
      contractFunctions.registerGame('SP1DEVELOPER', 'Test Game', gamePrice);
      contractFunctions.purchaseGame('SP1PLAYER1', 1);
      
      const stats = contractFunctions.getPlatformStats();
      expect(stats.platformBalance).toBe(expectedFee);
    });
  });

  describe('Tournament Management', () => {
    beforeEach(() => {
      contractFunctions.registerPlayer('SP1DEVELOPER');
      contractFunctions.registerPlayer('SP1PLAYER1');
      contractFunctions.registerPlayer('SP1PLAYER2');
      contractFunctions.depositFunds('SP1PLAYER1', 5000000);
      contractFunctions.depositFunds('SP1PLAYER2', 5000000);
      contractFunctions.registerGame('SP1DEVELOPER', 'Tournament Game', 1000000);
    });

    it('should create tournament successfully', () => {
      const result = contractFunctions.createTournament(
        'SP1DEVELOPER', 
        1, 
        'Test Tournament', 
        500000, 
        10, 
        86400000 // 24 hours
      );
      expect(result.success).toBe(1);
      
      const tournament = contractFunctions.getTournamentDetails(1);
      expect(tournament).toBeTruthy();
      expect(tournament.name).toBe('Test Tournament');
      expect(tournament.gameId).toBe(1);
      expect(tournament.entryFee).toBe(500000);
    });

    it('should prevent non-developers from creating tournaments', () => {
      const result = contractFunctions.createTournament(
        'SP1PLAYER1', 
        1, 
        'Test Tournament', 
        500000, 
        10, 
        86400000
      );
      expect(result.error).toBe('ERR_NOT_AUTHORIZED');
    });

    it('should allow players to join tournaments', () => {
      contractFunctions.createTournament('SP1DEVELOPER', 1, 'Test Tournament', 500000, 10, 86400000);
      const result = contractFunctions.joinTournament('SP1PLAYER1', 1);
      expect(result.success).toBe(true);
      
      const tournament = contractFunctions.getTournamentDetails(1);
      expect(tournament.currentParticipants).toBe(1);
      expect(tournament.prizePool).toBe(500000);
      
      const player = contractFunctions.getPlayerProfile('SP1PLAYER1');
      expect(player.balance).toBe(4500000); // 5M - 500K
    });

    it('should prevent joining tournaments with insufficient funds', () => {
      contractFunctions.createTournament('SP1DEVELOPER', 1, 'Expensive Tournament', 6000000, 10, 86400000);
      const result = contractFunctions.joinTournament('SP1PLAYER1', 1);
      expect(result.error).toBe('ERR_INSUFFICIENT_BALANCE');
    });

    it('should prevent duplicate tournament entries', () => {
      contractFunctions.createTournament('SP1DEVELOPER', 1, 'Test Tournament', 500000, 10, 86400000);
      contractFunctions.joinTournament('SP1PLAYER1', 1);
      const result = contractFunctions.joinTournament('SP1PLAYER1', 1);
      expect(result.error).toBe('ERR_ALREADY_REGISTERED');
    });

    it('should prevent joining when tournament is full', () => {
      contractFunctions.createTournament('SP1DEVELOPER', 1, 'Small Tournament', 500000, 1, 86400000);
      contractFunctions.joinTournament('SP1PLAYER1', 1);
      const result = contractFunctions.joinTournament('SP1PLAYER2', 1);
      expect(result.error).toBe('ERR_TOURNAMENT_ENDED');
    });
  });

  describe('Experience and Leveling System', () => {
    beforeEach(() => {
      contractFunctions.registerPlayer('SP1PLAYER1');
      contractFunctions.depositFunds('SP1PLAYER1', 50000000); // 50 STX
    });

    it('should calculate experience points correctly', () => {
      const amount = 1000000; // 1 STX
      const expectedExp = mockContract.calculateExpPoints(amount);
      expect(expectedExp).toBe(100);
    });

    it('should calculate levels correctly', () => {
      expect(mockContract.calculateLevel(500)).toBe(1);
      expect(mockContract.calculateLevel(1500)).toBe(2);
      expect(mockContract.calculateLevel(7500)).toBe(3);
      expect(mockContract.calculateLevel(25000)).toBe(4);
      expect(mockContract.calculateLevel(50000)).toBe(5);
      expect(mockContract.calculateLevel(100000)).toBe(6);
    });

    it('should update player level when gaining experience', () => {
      contractFunctions.registerGame('SP1DEVELOPER', 'XP Game', 25000000); // 25 STX
      contractFunctions.purchaseGame('SP1PLAYER1', 1);
      
      const player = contractFunctions.getPlayerProfile('SP1PLAYER1');
      expect(player.experiencePoints).toBe(2500); // 25M / 10000
      expect(player.level).toBe(2);
    });
  });

  describe('Platform Administration', () => {
    it('should allow owner to pause platform', () => {
      const result = contractFunctions.emergencyPause(mockContract.CONTRACT_OWNER);
      expect(result.success).toBe(true);
      
      const stats = contractFunctions.getPlatformStats();
      expect(stats.isPaused).toBe(true);
    });

    it('should prevent non-owners from pausing platform', () => {
      const result = contractFunctions.emergencyPause('SP1NOTOWNER');
      expect(result.error).toBe('ERR_NOT_AUTHORIZED');
    });

    it('should allow owner to resume operations', () => {
      contractFunctions.emergencyPause(mockContract.CONTRACT_OWNER);
      const result = contractFunctions.resumeOperations(mockContract.CONTRACT_OWNER);
      expect(result.success).toBe(true);
      
      const stats = contractFunctions.getPlatformStats();
      expect(stats.isPaused).toBe(false);
    });

    it('should prevent operations when platform is paused', () => {
      contractFunctions.emergencyPause(mockContract.CONTRACT_OWNER);
      const result = contractFunctions.registerPlayer('SP1PLAYER1');
      expect(result.error).toBe('ERR_NOT_AUTHORIZED');
    });
  });

  describe('Platform Statistics', () => {
    beforeEach(() => {
      contractFunctions.registerPlayer('SP1DEVELOPER');
      contractFunctions.registerPlayer('SP1PLAYER1');
      contractFunctions.depositFunds('SP1PLAYER1', 5000000);
    });

    it('should track platform statistics correctly', () => {
      // Register games and create tournaments
      contractFunctions.registerGame('SP1DEVELOPER', 'Game 1', 1000000);
      contractFunctions.registerGame('SP1DEVELOPER', 'Game 2', 2000000);
      contractFunctions.createTournament('SP1DEVELOPER', 1, 'Tournament 1', 500000, 10, 86400000);
      
      const stats = contractFunctions.getPlatformStats();
      expect(stats.totalGames).toBe(2);
      expect(stats.totalTournaments).toBe(1);
      expect(stats.totalItems).toBe(0);
      expect(stats.isPaused).toBe(false);
    });

    it('should track platform balance from fees', () => {
      const gamePrice = 1000000;
      const expectedFee = mockContract.calculatePlatformFee(gamePrice);
      
      contractFunctions.registerGame('SP1DEVELOPER', 'Test Game', gamePrice);
      contractFunctions.purchaseGame('SP1PLAYER1', 1);
      
      const stats = contractFunctions.getPlatformStats();
      expect(stats.platformBalance).toBe(expectedFee);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle non-existent game purchases', () => {
      contractFunctions.registerPlayer('SP1PLAYER1');
      contractFunctions.depositFunds('SP1PLAYER1', 5000000);
      
      const result = contractFunctions.purchaseGame('SP1PLAYER1', 999);
      expect(result.error).toBe('ERR_GAME_NOT_FOUND');
    });

    it('should handle non-existent tournament joins', () => {
      contractFunctions.registerPlayer('SP1PLAYER1');
      contractFunctions.depositFunds('SP1PLAYER1', 5000000);
      
      const result = contractFunctions.joinTournament('SP1PLAYER1', 999);
      expect(result.error).toBe('ERR_TOURNAMENT_NOT_FOUND');
    });

    it('should handle zero amounts correctly', () => {
      contractFunctions.registerPlayer('SP1PLAYER1');
      const result = contractFunctions.depositFunds('SP1PLAYER1', 0);
      expect(result.error).toBe('ERR_INVALID_AMOUNT');
    });

    it('should handle invalid tournament parameters', () => {
      contractFunctions.registerPlayer('SP1DEVELOPER');
      contractFunctions.registerGame('SP1DEVELOPER', 'Test Game', 1000000);
      
      // Test with 0 max participants
      const result1 = contractFunctions.createTournament('SP1DEVELOPER', 1, 'Bad Tournament', 500000, 0, 86400000);
      expect(result1.error).toBe('ERR_INVALID_AMOUNT');
      
      // Test with 0 duration
      const result2 = contractFunctions.createTournament('SP1DEVELOPER', 1, 'Bad Tournament', 500000, 10, 0);
      expect(result2.error).toBe('ERR_INVALID_AMOUNT');
    });
  });

  describe('Integration Tests', () => {
    it('should handle complete game purchase and tournament flow', () => {
      // Setup
      const developer = 'SP1DEVELOPER';
      const player1 = 'SP1PLAYER1';
      const player2 = 'SP1PLAYER2';
      
      contractFunctions.registerPlayer(developer);
      contractFunctions.registerPlayer(player1);
      contractFunctions.registerPlayer(player2);
      
      contractFunctions.depositFunds(player1, 10000000);
      contractFunctions.depositFunds(player2, 10000000);
      
      // Create and purchase game
      const gameResult = contractFunctions.registerGame(developer, 'Tournament Game', 2000000);
      expect(gameResult.success).toBe(1);
      
      contractFunctions.purchaseGame(player1, 1);
      contractFunctions.purchaseGame(player2, 1);
      
      // Create and join tournament
      const tournamentResult = contractFunctions.createTournament(developer, 1, 'Championship', 1000000, 5, 86400000);
      expect(tournamentResult.success).toBe(1);
      
      contractFunctions.joinTournament(player1, 1);
      contractFunctions.joinTournament(player2, 1);
      
      // Verify final state
      const tournament = contractFunctions.getTournamentDetails(1);
      expect(tournament.currentParticipants).toBe(2);
      expect(tournament.prizePool).toBe(2000000);
      
      const game = contractFunctions.getGameDetails(1);
      expect(game.totalPlayers).toBe(2);
      
      const stats = contractFunctions.getPlatformStats();
      expect(stats.platformBalance).toBe(100000); // 2.5% of 4M total spent
    });
  });
});