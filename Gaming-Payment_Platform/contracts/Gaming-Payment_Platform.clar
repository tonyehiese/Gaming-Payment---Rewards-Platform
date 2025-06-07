;; Gaming Payment & Rewards Platform Smart Contract
;; Written in Clarity for Stacks Blockchain

;; Constants
(define-constant CONTRACT_OWNER tx-sender)
(define-constant PLATFORM_FEE_RATE u250) ;; 2.5% platform fee
(define-constant MIN_PAYMENT u100000) ;; 0.1 STX minimum payment
(define-constant MAX_REWARD_MULTIPLIER u1000) ;; 10x max reward multiplier
(define-constant TOURNAMENT_ENTRY_FEE u1000000) ;; 1 STX tournament entry

;; Error constants
(define-constant ERR_NOT_AUTHORIZED (err u401))
(define-constant ERR_INSUFFICIENT_BALANCE (err u402))
(define-constant ERR_INVALID_AMOUNT (err u403))
(define-constant ERR_PLAYER_NOT_FOUND (err u404))
(define-constant ERR_GAME_NOT_FOUND (err u405))
(define-constant ERR_TOURNAMENT_NOT_FOUND (err u406))
(define-constant ERR_ALREADY_REGISTERED (err u407))
(define-constant ERR_TOURNAMENT_ENDED (err u408))
(define-constant ERR_INVALID_SCORE (err u409))
(define-constant ERR_REWARD_ALREADY_CLAIMED (err u410))
(define-constant ERR_ITEM_NOT_FOUND (err u411))
(define-constant ERR_INSUFFICIENT_ITEMS (err u412))

;; Data Variables
(define-data-var platform-balance uint u0)
(define-data-var total-rewards-distributed uint u0)
(define-data-var game-id-counter uint u0)
(define-data-var tournament-id-counter uint u0)
(define-data-var item-id-counter uint u0)
(define-data-var platform-paused bool false)

;; Data Maps

;; Player profiles and balances
(define-map players
  principal
  {
    balance: uint,
    total-spent: uint,
    total-earned: uint,
    experience-points: uint,
    level: uint,
    is-active: bool,
    registration-time: uint
  }
)

;; Game registry
(define-map games
  uint ;; game-id
  {
    name: (string-ascii 64),
    developer: principal,
    price: uint,
    reward-pool: uint,
    is-active: bool,
    created-at: uint,
    total-players: uint
  }
)

;; Player game ownership
(define-map player-games
  {player: principal, game-id: uint}
  {
    purchased-at: uint,
    playtime: uint,
    high-score: uint,
    achievements: uint
  }
)

;; In-game items/NFTs
(define-map game-items
  uint ;; item-id
  {
    game-id: uint,
    name: (string-ascii 64),
    description: (string-ascii 256),
    price: uint,
    rarity: uint, ;; 1-5 scale
    supply: uint,
    max-supply: uint,
    creator: principal
  }
)

;; Player item ownership
(define-map player-items
  {player: principal, item-id: uint}
  uint ;; quantity owned
)

;; Tournaments
(define-map tournaments
  uint ;; tournament-id
  {
    game-id: uint,
    name: (string-ascii 64),
    entry-fee: uint,
    prize-pool: uint,
    max-participants: uint,
    current-participants: uint,
    start-time: uint,
    end-time: uint,
    is-active: bool,
    winner: (optional principal)
  }
)
;; Tournament participants
(define-map tournament-participants
  {tournament-id: uint, player: principal}
  {
    entry-time: uint,
    score: uint,
    rank: uint,
    prize-claimed: bool
  }
)

;; Achievement system
(define-map achievements
  uint ;; achievement-id
  {
    name: (string-ascii 64),
    description: (string-ascii 256),
    reward-points: uint,
    game-id: uint,
    requirement: uint
  }
)

;; Player achievements
(define-map player-achievements
  {player: principal, achievement-id: uint}
  {
    unlocked-at: uint,
    reward-claimed: bool
  }
)

;; Reward multipliers based on level
(define-map level-multipliers
  uint ;; level
  uint ;; multiplier (in basis points)
)

;; Private Functions

;; Calculate platform fee
(define-private (calculate-platform-fee (amount uint))
  (/ (* amount PLATFORM_FEE_RATE) u10000)
)

;; Calculate experience points based on spending
(define-private (calculate-exp-points (amount uint))
  (/ amount u10000) ;; 1 XP per 0.01 STX spent
)

;; Calculate player level from experience points
(define-private (calculate-level (exp-points uint))
  (if (<= exp-points u1000) u1
    (if (<= exp-points u5000) u2
      (if (<= exp-points u15000) u3
        (if (<= exp-points u35000) u4
          (if (<= exp-points u75000) u5
            u6)))))
)

;; Get current block height as timestamp
(define-private (get-current-time)
  stacks-block-height
)

;; Validate payment amount
(define-private (is-valid-payment (amount uint))
  (>= amount MIN_PAYMENT)
)

;; Public Functions

;; Player registration and management
(define-public (register-player)
  (let ((caller tx-sender)
        (current-time (get-current-time)))
    (asserts! (not (var-get platform-paused)) ERR_NOT_AUTHORIZED)
    (asserts! (is-none (map-get? players caller)) ERR_ALREADY_REGISTERED)
    
    (map-set players caller {
      balance: u0,
      total-spent: u0,
      total-earned: u0,
      experience-points: u0,
      level: u1,
      is-active: true,
      registration-time: current-time
    })
    
    (ok true)
  )
)

;; Add funds to player balance
(define-public (deposit-funds (amount uint))
  (let ((caller tx-sender)
        (player (unwrap! (map-get? players caller) ERR_PLAYER_NOT_FOUND)))
    (asserts! (not (var-get platform-paused)) ERR_NOT_AUTHORIZED)
    (asserts! (is-valid-payment amount) ERR_INVALID_AMOUNT)
    (asserts! (get is-active player) ERR_NOT_AUTHORIZED)
    
    ;; Transfer STX from player to contract
    (try! (stx-transfer? amount caller (as-contract tx-sender)))
    
    ;; Update player balance
    (map-set players caller {
      balance: (+ (get balance player) amount),
      total-spent: (get total-spent player),
      total-earned: (get total-earned player),
      experience-points: (get experience-points player),
      level: (get level player),
      is-active: true,
      registration-time: (get registration-time player)
    })
    
    (ok amount)
  )
)

;; Withdraw funds from player balance
(define-public (withdraw-funds (amount uint))
  (let ((caller tx-sender)
        (player (unwrap! (map-get? players caller) ERR_PLAYER_NOT_FOUND)))
    (asserts! (not (var-get platform-paused)) ERR_NOT_AUTHORIZED)
    (asserts! (get is-active player) ERR_NOT_AUTHORIZED)
    (asserts! (<= amount (get balance player)) ERR_INSUFFICIENT_BALANCE)
    
    ;; Transfer STX from contract to player
    (try! (as-contract (stx-transfer? amount tx-sender caller)))
    
    ;; Update player balance
    (map-set players caller {
      balance: (- (get balance player) amount),
      total-spent: (get total-spent player),
      total-earned: (get total-earned player),
      experience-points: (get experience-points player),
      level: (get level player),
      is-active: true,
      registration-time: (get registration-time player)
    })
    
    (ok amount)
  )
)

;; Game Management
(define-public (register-game (name (string-ascii 64)) (price uint))
  (let ((caller tx-sender)
        (new-game-id (+ (var-get game-id-counter) u1))
        (current-time (get-current-time)))
    (asserts! (not (var-get platform-paused)) ERR_NOT_AUTHORIZED)
    (asserts! (is-valid-payment price) ERR_INVALID_AMOUNT)
    
    (map-set games new-game-id {
      name: name,
      developer: caller,
      price: price,
      reward-pool: u0,
      is-active: true,
      created-at: current-time,
      total-players: u0
    })
    
    (var-set game-id-counter new-game-id)
    
    (ok new-game-id)
  )
)

;; Purchase game
(define-public (purchase-game (game-id uint))
  (let ((caller tx-sender)
        (player (unwrap! (map-get? players caller) ERR_PLAYER_NOT_FOUND))
        (game (unwrap! (map-get? games game-id) ERR_GAME_NOT_FOUND))
        (current-time (get-current-time))
        (platform-fee (calculate-platform-fee (get price game)))
        (developer-payment (- (get price game) platform-fee))
        (exp-points (calculate-exp-points (get price game))))
    
    (asserts! (not (var-get platform-paused)) ERR_NOT_AUTHORIZED)
    (asserts! (get is-active game) ERR_GAME_NOT_FOUND)
    (asserts! (get is-active player) ERR_NOT_AUTHORIZED)
    (asserts! (<= (get price game) (get balance player)) ERR_INSUFFICIENT_BALANCE)
    (asserts! (is-none (map-get? player-games {player: caller, game-id: game-id})) ERR_ALREADY_REGISTERED)
    
    ;; Update player balance and stats
    (map-set players caller {
      balance: (- (get balance player) (get price game)),
      total-spent: (+ (get total-spent player) (get price game)),
      total-earned: (get total-earned player),
      experience-points: (+ (get experience-points player) exp-points),
      level: (calculate-level (+ (get experience-points player) exp-points)),
      is-active: true,
      registration-time: (get registration-time player)
    })
    
    ;; Record game ownership
    (map-set player-games {player: caller, game-id: game-id} {
      purchased-at: current-time,
      playtime: u0,
      high-score: u0,
      achievements: u0
    })
    
    ;; Update game stats
    (map-set games game-id {
      name: (get name game),
      developer: (get developer game),
      price: (get price game),
      reward-pool: (get reward-pool game),
      is-active: (get is-active game),
      created-at: (get created-at game),
      total-players: (+ (get total-players game) u1)
    })
    
    ;; Transfer payment to developer
    (try! (as-contract (stx-transfer? developer-payment tx-sender (get developer game))))
    
    ;; Add platform fee to platform balance
    (var-set platform-balance (+ (var-get platform-balance) platform-fee))
    
    (ok true)
  )
)

;; Create in-game item/NFT
(define-public (create-game-item (game-id uint) (name (string-ascii 64)) (description (string-ascii 256)) (price uint) (rarity uint) (max-supply uint))
  (let ((caller tx-sender)
        (game (unwrap! (map-get? games game-id) ERR_GAME_NOT_FOUND))
        (new-item-id (+ (var-get item-id-counter) u1)))
    (asserts! (not (var-get platform-paused)) ERR_NOT_AUTHORIZED)
    (asserts! (is-eq caller (get developer game)) ERR_NOT_AUTHORIZED)
    (asserts! (get is-active game) ERR_GAME_NOT_FOUND)
    (asserts! (and (>= rarity u1) (<= rarity u5)) ERR_INVALID_AMOUNT)
    (asserts! (> max-supply u0) ERR_INVALID_AMOUNT)
    
    (map-set game-items new-item-id {
      game-id: game-id,
      name: name,
      description: description,
      price: price,
      rarity: rarity,
      supply: u0,
      max-supply: max-supply,
      creator: caller
    })
    
    (var-set item-id-counter new-item-id)
    
    (ok new-item-id)
  )
)

;; Purchase in-game item
(define-public (purchase-item (item-id uint) (quantity uint))
  (let ((caller tx-sender)
        (player (unwrap! (map-get? players caller) ERR_PLAYER_NOT_FOUND))
        (item (unwrap! (map-get? game-items item-id) ERR_ITEM_NOT_FOUND))
        (total-cost (* (get price item) quantity))
        (current-owned (default-to u0 (map-get? player-items {player: caller, item-id: item-id})))
        (platform-fee (calculate-platform-fee total-cost))
        (creator-payment (- total-cost platform-fee)))
    
    (asserts! (not (var-get platform-paused)) ERR_NOT_AUTHORIZED)
    (asserts! (get is-active player) ERR_NOT_AUTHORIZED)
    (asserts! (> quantity u0) ERR_INVALID_AMOUNT)
    (asserts! (<= (+ (get supply item) quantity) (get max-supply item)) ERR_INSUFFICIENT_ITEMS)
    (asserts! (<= total-cost (get balance player)) ERR_INSUFFICIENT_BALANCE)
    
    ;; Update player balance
    (map-set players caller {
      balance: (- (get balance player) total-cost),
      total-spent: (+ (get total-spent player) total-cost),
      total-earned: (get total-earned player),
      experience-points: (+ (get experience-points player) (calculate-exp-points total-cost)),
      level: (calculate-level (+ (get experience-points player) (calculate-exp-points total-cost))),
      is-active: true,
      registration-time: (get registration-time player)
    })
    
    ;; Update player item ownership
    (map-set player-items {player: caller, item-id: item-id} (+ current-owned quantity))
    
    ;; Update item supply
    (map-set game-items item-id {
      game-id: (get game-id item),
      name: (get name item),
      description: (get description item),
      price: (get price item),
      rarity: (get rarity item),
      supply: (+ (get supply item) quantity),
      max-supply: (get max-supply item),
      creator: (get creator item)
    })
    
    ;; Transfer payment to creator
    (try! (as-contract (stx-transfer? creator-payment tx-sender (get creator item))))
    
    ;; Add platform fee
    (var-set platform-balance (+ (var-get platform-balance) platform-fee))
    
    (ok quantity)
  )
)

;; Tournament Management
(define-public (create-tournament (game-id uint) (name (string-ascii 64)) (entry-fee uint) (max-participants uint) (duration uint))
  (let ((caller tx-sender)
        (game (unwrap! (map-get? games game-id) ERR_GAME_NOT_FOUND))
        (new-tournament-id (+ (var-get tournament-id-counter) u1))
        (current-time (get-current-time)))
    (asserts! (not (var-get platform-paused)) ERR_NOT_AUTHORIZED)
    (asserts! (is-eq caller (get developer game)) ERR_NOT_AUTHORIZED)
    (asserts! (get is-active game) ERR_GAME_NOT_FOUND)
    (asserts! (> max-participants u1) ERR_INVALID_AMOUNT)
    (asserts! (> duration u0) ERR_INVALID_AMOUNT)
    
    (map-set tournaments new-tournament-id {
      game-id: game-id,
      name: name,
      entry-fee: entry-fee,
      prize-pool: u0,
      max-participants: max-participants,
      current-participants: u0,
      start-time: current-time,
      end-time: (+ current-time duration),
      is-active: true,
      winner: none
    })
    
    (var-set tournament-id-counter new-tournament-id)
    
    (ok new-tournament-id)
  )
)

;; Join tournament
(define-public (join-tournament (tournament-id uint))
  (let ((caller tx-sender)
        (player (unwrap! (map-get? players caller) ERR_PLAYER_NOT_FOUND))
        (tournament (unwrap! (map-get? tournaments tournament-id) ERR_TOURNAMENT_NOT_FOUND))
        (current-time (get-current-time)))
    
    (asserts! (not (var-get platform-paused)) ERR_NOT_AUTHORIZED)
    (asserts! (get is-active player) ERR_NOT_AUTHORIZED)
    (asserts! (get is-active tournament) ERR_TOURNAMENT_NOT_FOUND)
    (asserts! (< current-time (get end-time tournament)) ERR_TOURNAMENT_ENDED)
    (asserts! (< (get current-participants tournament) (get max-participants tournament)) ERR_TOURNAMENT_ENDED)
    (asserts! (<= (get entry-fee tournament) (get balance player)) ERR_INSUFFICIENT_BALANCE)
    (asserts! (is-none (map-get? tournament-participants {tournament-id: tournament-id, player: caller})) ERR_ALREADY_REGISTERED)
    
    ;; Update player balance
    (map-set players caller {
      balance: (- (get balance player) (get entry-fee tournament)),
      total-spent: (+ (get total-spent player) (get entry-fee tournament)),
      total-earned: (get total-earned player),
      experience-points: (get experience-points player),
      level: (get level player),
      is-active: true,
      registration-time: (get registration-time player)
    })
    
    ;; Register tournament participation
    (map-set tournament-participants {tournament-id: tournament-id, player: caller} {
      entry-time: current-time,
      score: u0,
      rank: u0,
      prize-claimed: false
    })
    
    ;; Update tournament stats
    (map-set tournaments tournament-id {
      game-id: (get game-id tournament),
      name: (get name tournament),
      entry-fee: (get entry-fee tournament),
      prize-pool: (+ (get prize-pool tournament) (get entry-fee tournament)),
      max-participants: (get max-participants tournament),
      current-participants: (+ (get current-participants tournament) u1),
      start-time: (get start-time tournament),
      end-time: (get end-time tournament),
      is-active: (get is-active tournament),
      winner: (get winner tournament)
    })
    
    (ok true)
  )
)

;; Submit tournament score
(define-public (submit-score (tournament-id uint) (score uint))
  (let ((caller tx-sender)
        (tournament (unwrap! (map-get? tournaments tournament-id) ERR_TOURNAMENT_NOT_FOUND))
        (participation (unwrap! (map-get? tournament-participants {tournament-id: tournament-id, player: caller}) ERR_PLAYER_NOT_FOUND))
        (current-time (get-current-time)))
    
    (asserts! (not (var-get platform-paused)) ERR_NOT_AUTHORIZED)
    (asserts! (get is-active tournament) ERR_TOURNAMENT_NOT_FOUND)
    (asserts! (< current-time (get end-time tournament)) ERR_TOURNAMENT_ENDED)
    
    ;; Update participant score
    (map-set tournament-participants {tournament-id: tournament-id, player: caller} {
      entry-time: (get entry-time participation),
      score: score,
      rank: (get rank participation),
      prize-claimed: (get prize-claimed participation)
    })
    
    (ok score)
  )
)

;; Distribute rewards based on performance
(define-public (distribute-reward (player principal) (amount uint) (reason (string-ascii 64)))
  (let ((recipient (unwrap! (map-get? players player) ERR_PLAYER_NOT_FOUND))
        (current-time (get-current-time)))
    (asserts! (is-eq tx-sender CONTRACT_OWNER) ERR_NOT_AUTHORIZED)
    (asserts! (not (var-get platform-paused)) ERR_NOT_AUTHORIZED)
    (asserts! (get is-active recipient) ERR_NOT_AUTHORIZED)
    (asserts! (> amount u0) ERR_INVALID_AMOUNT)
    
    ;; Transfer reward from contract to player
    (try! (as-contract (stx-transfer? amount tx-sender player)))
    
    ;; Update player stats
    (map-set players player {
      balance: (+ (get balance recipient) amount),
      total-spent: (get total-spent recipient),
      total-earned: (+ (get total-earned recipient) amount),
      experience-points: (+ (get experience-points recipient) (calculate-exp-points amount)),
      level: (calculate-level (+ (get experience-points recipient) (calculate-exp-points amount))),
      is-active: true,
      registration-time: (get registration-time recipient)
    })
    
    ;; Update platform stats
    (var-set total-rewards-distributed (+ (var-get total-rewards-distributed) amount))
    
    (ok amount)
  )
)

;; Read-only Functions

;; Get player profile
(define-read-only (get-player-profile (player principal))
  (map-get? players player)
)

;; Get game details
(define-read-only (get-game-details (game-id uint))
  (map-get? games game-id)
)

;; Get tournament details
(define-read-only (get-tournament-details (tournament-id uint))
  (map-get? tournaments tournament-id)
)

;; Get player game ownership
(define-read-only (get-player-game (player principal) (game-id uint))
  (map-get? player-games {player: player, game-id: game-id})
)

;; Get player item ownership
(define-read-only (get-player-item-count (player principal) (item-id uint))
  (default-to u0 (map-get? player-items {player: player, item-id: item-id}))
)

;; Get item details
(define-read-only (get-item-details (item-id uint))
  (map-get? game-items item-id)
)

;; Get tournament participation
(define-read-only (get-tournament-participation (tournament-id uint) (player principal))
  (map-get? tournament-participants {tournament-id: tournament-id, player: player})
)

;; Get platform statistics
(define-read-only (get-platform-stats)
  (ok {
    platform-balance: (var-get platform-balance),
    total-rewards-distributed: (var-get total-rewards-distributed),
    total-games: (var-get game-id-counter),
    total-tournaments: (var-get tournament-id-counter),
    total-items: (var-get item-id-counter),
    is-paused: (var-get platform-paused)
  })
)

;; Administrative Functions (Owner only)

;; Emergency pause
(define-public (emergency-pause)
  (begin
    (asserts! (is-eq tx-sender CONTRACT_OWNER) ERR_NOT_AUTHORIZED)
    (var-set platform-paused true)
    (ok true)
  )
)

;; Resume operations
(define-public (resume-operations)
  (begin
    (asserts! (is-eq tx-sender CONTRACT_OWNER) ERR_NOT_AUTHORIZED)
    (var-set platform-paused false)
    (ok true)
  )
)

;; Withdraw platform fees
(define-public (withdraw-platform-fees (amount uint))
  (let ((current-balance (var-get platform-balance)))
    (asserts! (is-eq tx-sender CONTRACT_OWNER) ERR_NOT_AUTHORIZED)
    (asserts! (<= amount current-balance) ERR_INSUFFICIENT_BALANCE)
    
    (try! (as-contract (stx-transfer? amount tx-sender CONTRACT_OWNER)))
    (var-set platform-balance (- current-balance amount))
    
    (ok amount)
  )
)