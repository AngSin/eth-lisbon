/// Fixed-term DUSDC loans against hBTC collateral.
#[allow(lint(public_entry))]
module nomad_loans::protocol;

use sui::clock::{Self, Clock};
use sui::coin::{Self, Coin};
use sui::event;

const VERSION: u64 = 1;

const STATUS_OPEN: u8 = 0;
const STATUS_CANCELLED: u8 = 1;
const STATUS_ACCEPTED: u8 = 2;
const STATUS_ACTIVE: u8 = 3;
const STATUS_REPAID: u8 = 4;
const STATUS_DEFAULT_CLAIMED: u8 = 5;

const EZeroPrincipal: u64 = 0;
const EZeroCollateral: u64 = 1;
const EZeroDuration: u64 = 2;
const EExpiredAtNotFuture: u64 = 3;
const EPrincipalMismatch: u64 = 4;
const ENotLender: u64 = 5;
const EOfferNotOpen: u64 = 6;
const EOfferExpired: u64 = 7;
const EInsufficientCollateral: u64 = 8;
const ENotBorrower: u64 = 9;
const ELoanNotActive: u64 = 10;
const EInsufficientRepayment: u64 = 11;
const ELoanMatured: u64 = 12;
const ELoanNotMatured: u64 = 13;
public struct LoanRegistry<phantom DUSDC, phantom HBTC> has key {
    id: UID,
    next_offer_id: u64,
    next_loan_id: u64,
}

public struct LoanOffer<phantom DUSDC, phantom HBTC> has key {
    id: UID,
    offer_id: u64,
    lender: address,
    principal_amount: u64,
    fixed_interest_amount: u64,
    total_due_amount: u64,
    collateral_required: u64,
    duration_ms: u64,
    expires_at_ms: u64,
    created_at_ms: u64,
    status: u8,
    principal_escrow: Option<Coin<DUSDC>>,
}

public struct ActiveLoan<phantom DUSDC, phantom HBTC> has key {
    id: UID,
    loan_id: u64,
    offer_id: u64,
    borrower: address,
    lender: address,
    principal_amount: u64,
    fixed_interest_amount: u64,
    total_due_amount: u64,
    collateral_amount: u64,
    started_at_ms: u64,
    maturity_ms: u64,
    status: u8,
    collateral_escrow: Option<Coin<HBTC>>,
}

public struct OfferCreated has copy, drop {
    version: u64,
    offer_id: u64,
    offer_object_id: ID,
    lender: address,
    principal_amount: u64,
    fixed_interest_amount: u64,
    total_due_amount: u64,
    collateral_required: u64,
    duration_ms: u64,
    expires_at_ms: u64,
    created_at_ms: u64,
}

public struct OfferCancelled has copy, drop {
    version: u64,
    offer_id: u64,
    offer_object_id: ID,
    lender: address,
    cancelled_at_ms: u64,
}

public struct LoanCreated has copy, drop {
    version: u64,
    offer_id: u64,
    offer_object_id: ID,
    loan_id: u64,
    loan_object_id: ID,
    borrower: address,
    lender: address,
    principal_amount: u64,
    fixed_interest_amount: u64,
    total_due_amount: u64,
    collateral_amount: u64,
    started_at_ms: u64,
    maturity_ms: u64,
}

public struct LoanRepaid has copy, drop {
    version: u64,
    loan_id: u64,
    loan_object_id: ID,
    borrower: address,
    lender: address,
    total_due_amount: u64,
    collateral_amount: u64,
    repaid_at_ms: u64,
}

public struct CollateralClaimed has copy, drop {
    version: u64,
    loan_id: u64,
    loan_object_id: ID,
    borrower: address,
    lender: address,
    collateral_amount: u64,
    claimed_at_ms: u64,
}

public fun new_registry<DUSDC, HBTC>(ctx: &mut TxContext): LoanRegistry<DUSDC, HBTC> {
    LoanRegistry {
        id: object::new(ctx),
        next_offer_id: 0,
        next_loan_id: 0,
    }
}

public entry fun init_registry<DUSDC, HBTC>(ctx: &mut TxContext) {
    transfer::share_object(new_registry<DUSDC, HBTC>(ctx));
}

public entry fun create_offer<DUSDC, HBTC>(
    registry: &mut LoanRegistry<DUSDC, HBTC>,
    mut dusdc_coin: Coin<DUSDC>,
    principal_amount: u64,
    fixed_interest_amount: u64,
    collateral_required: u64,
    duration_ms: u64,
    expires_at_ms: u64,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    let now_ms = clock.timestamp_ms();
    assert!(principal_amount > 0, EZeroPrincipal);
    assert!(collateral_required > 0, EZeroCollateral);
    assert!(duration_ms > 0, EZeroDuration);
    assert!(expires_at_ms > now_ms, EExpiredAtNotFuture);
    assert!(dusdc_coin.value() >= principal_amount, EPrincipalMismatch);

    let lender = ctx.sender();
    let principal_escrow = dusdc_coin.split(principal_amount, ctx);
    let change = dusdc_coin.value();
    if (change > 0) {
        transfer::public_transfer(dusdc_coin, lender);
    } else {
        dusdc_coin.destroy_zero();
    };

    let offer_id = registry.next_offer_id;
    registry.next_offer_id = offer_id + 1;
    let offer = LoanOffer<DUSDC, HBTC> {
        id: object::new(ctx),
        offer_id,
        lender,
        principal_amount,
        fixed_interest_amount,
        total_due_amount: principal_amount + fixed_interest_amount,
        collateral_required,
        duration_ms,
        expires_at_ms,
        created_at_ms: now_ms,
        status: STATUS_OPEN,
        principal_escrow: option::some(principal_escrow),
    };
    let offer_object_id = object::id(&offer);

    event::emit(OfferCreated {
        version: VERSION,
        offer_id,
        offer_object_id,
        lender,
        principal_amount,
        fixed_interest_amount,
        total_due_amount: principal_amount + fixed_interest_amount,
        collateral_required,
        duration_ms,
        expires_at_ms,
        created_at_ms: now_ms,
    });

    transfer::share_object(offer);
}

public entry fun cancel_offer<DUSDC, HBTC>(
    offer: &mut LoanOffer<DUSDC, HBTC>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    let lender = ctx.sender();
    assert!(lender == offer.lender, ENotLender);
    assert!(offer.status == STATUS_OPEN, EOfferNotOpen);

    let principal_escrow = offer.principal_escrow.extract();
    offer.status = STATUS_CANCELLED;

    event::emit(OfferCancelled {
        version: VERSION,
        offer_id: offer.offer_id,
        offer_object_id: object::id(offer),
        lender,
        cancelled_at_ms: clock.timestamp_ms(),
    });

    transfer::public_transfer(principal_escrow, lender);
}

public entry fun accept_offer<DUSDC, HBTC>(
    registry: &mut LoanRegistry<DUSDC, HBTC>,
    offer: &mut LoanOffer<DUSDC, HBTC>,
    mut hbtc_coin: Coin<HBTC>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    let now_ms = clock.timestamp_ms();
    let borrower = ctx.sender();
    assert!(offer.status == STATUS_OPEN, EOfferNotOpen);
    assert!(now_ms <= offer.expires_at_ms, EOfferExpired);
    assert!(hbtc_coin.value() >= offer.collateral_required, EInsufficientCollateral);

    let collateral_escrow = hbtc_coin.split(offer.collateral_required, ctx);
    let collateral_change = hbtc_coin.value();
    if (collateral_change > 0) {
        transfer::public_transfer(hbtc_coin, borrower);
    } else {
        hbtc_coin.destroy_zero();
    };

    let principal_escrow = offer.principal_escrow.extract();
    offer.status = STATUS_ACCEPTED;

    let loan_id = registry.next_loan_id;
    registry.next_loan_id = loan_id + 1;
    let loan = ActiveLoan<DUSDC, HBTC> {
        id: object::new(ctx),
        loan_id,
        offer_id: offer.offer_id,
        borrower,
        lender: offer.lender,
        principal_amount: offer.principal_amount,
        fixed_interest_amount: offer.fixed_interest_amount,
        total_due_amount: offer.total_due_amount,
        collateral_amount: offer.collateral_required,
        started_at_ms: now_ms,
        maturity_ms: now_ms + offer.duration_ms,
        status: STATUS_ACTIVE,
        collateral_escrow: option::some(collateral_escrow),
    };
    let loan_object_id = object::id(&loan);

    event::emit(LoanCreated {
        version: VERSION,
        offer_id: offer.offer_id,
        offer_object_id: object::id(offer),
        loan_id,
        loan_object_id,
        borrower,
        lender: offer.lender,
        principal_amount: offer.principal_amount,
        fixed_interest_amount: offer.fixed_interest_amount,
        total_due_amount: offer.total_due_amount,
        collateral_amount: offer.collateral_required,
        started_at_ms: now_ms,
        maturity_ms: now_ms + offer.duration_ms,
    });

    transfer::public_transfer(principal_escrow, borrower);
    transfer::share_object(loan);
}

public entry fun repay<DUSDC, HBTC>(
    loan: &mut ActiveLoan<DUSDC, HBTC>,
    mut dusdc_coin: Coin<DUSDC>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    let borrower = ctx.sender();
    let now_ms = clock.timestamp_ms();
    assert!(borrower == loan.borrower, ENotBorrower);
    assert!(loan.status == STATUS_ACTIVE, ELoanNotActive);
    assert!(now_ms <= loan.maturity_ms, ELoanMatured);
    assert!(dusdc_coin.value() >= loan.total_due_amount, EInsufficientRepayment);

    let repayment = dusdc_coin.split(loan.total_due_amount, ctx);
    let change = dusdc_coin.value();
    if (change > 0) {
        transfer::public_transfer(dusdc_coin, borrower);
    } else {
        dusdc_coin.destroy_zero();
    };

    let collateral = loan.collateral_escrow.extract();
    loan.status = STATUS_REPAID;

    event::emit(LoanRepaid {
        version: VERSION,
        loan_id: loan.loan_id,
        loan_object_id: object::id(loan),
        borrower,
        lender: loan.lender,
        total_due_amount: loan.total_due_amount,
        collateral_amount: loan.collateral_amount,
        repaid_at_ms: now_ms,
    });

    transfer::public_transfer(repayment, loan.lender);
    transfer::public_transfer(collateral, borrower);
}

public entry fun claim_default<DUSDC, HBTC>(
    loan: &mut ActiveLoan<DUSDC, HBTC>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    let lender = ctx.sender();
    let now_ms = clock.timestamp_ms();
    assert!(lender == loan.lender, ENotLender);
    assert!(loan.status == STATUS_ACTIVE, ELoanNotActive);
    assert!(now_ms > loan.maturity_ms, ELoanNotMatured);

    let collateral = loan.collateral_escrow.extract();
    loan.status = STATUS_DEFAULT_CLAIMED;

    event::emit(CollateralClaimed {
        version: VERSION,
        loan_id: loan.loan_id,
        loan_object_id: object::id(loan),
        borrower: loan.borrower,
        lender,
        collateral_amount: loan.collateral_amount,
        claimed_at_ms: now_ms,
    });

    transfer::public_transfer(collateral, lender);
}

public fun offer_status<DUSDC, HBTC>(offer: &LoanOffer<DUSDC, HBTC>): u8 {
    offer.status
}

public fun loan_status<DUSDC, HBTC>(loan: &ActiveLoan<DUSDC, HBTC>): u8 {
    loan.status
}

public fun offer_id<DUSDC, HBTC>(offer: &LoanOffer<DUSDC, HBTC>): u64 {
    offer.offer_id
}

public fun loan_id<DUSDC, HBTC>(loan: &ActiveLoan<DUSDC, HBTC>): u64 {
    loan.loan_id
}

public fun offer_has_escrow<DUSDC, HBTC>(offer: &LoanOffer<DUSDC, HBTC>): bool {
    offer.principal_escrow.is_some()
}

public fun loan_has_collateral<DUSDC, HBTC>(loan: &ActiveLoan<DUSDC, HBTC>): bool {
    loan.collateral_escrow.is_some()
}

public fun status_open(): u8 { STATUS_OPEN }

public fun status_cancelled(): u8 { STATUS_CANCELLED }

public fun status_accepted(): u8 { STATUS_ACCEPTED }

public fun status_active(): u8 { STATUS_ACTIVE }

public fun status_repaid(): u8 { STATUS_REPAID }

public fun status_default_claimed(): u8 { STATUS_DEFAULT_CLAIMED }
