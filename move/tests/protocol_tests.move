#[test_only]
#[allow(unused_mut_ref)]
module nomad_loans::protocol_tests;

use nomad_loans::protocol::{Self, ActiveLoan, LoanOffer, LoanRegistry};
use std::unit_test::assert_eq;
use sui::clock::{Self, Clock};
use sui::coin::{Self, Coin};
use sui::test_scenario::{Self, Scenario};

public struct DUSDC has drop {}
public struct HBTC has drop {}

const LENDER: address = @0xA;
const BORROWER: address = @0xB;
const THIRD_PARTY: address = @0xC;

const PRINCIPAL: u64 = 1_000;
const INTEREST: u64 = 100;
const COLLATERAL: u64 = 50;
const DURATION_MS: u64 = 1_000;
const EXPIRES_AT_MS: u64 = 10_000;

#[test]
fun create_offer_holds_dusdc_escrow() {
    let mut s = setup(LENDER);

    create_standard_offer(&mut s);
    s.next_tx(LENDER);

    test_scenario::with_shared!<LoanOffer<DUSDC, HBTC>>(&mut s, |offer, _s| {
        assert_eq!(offer.offer_status(), protocol::status_open());
        assert!(offer.offer_has_escrow());
    });

    s.end();
}

#[test]
fun lender_can_cancel_open_offer_and_get_principal_back() {
    let mut s = setup(LENDER);

    create_standard_offer(&mut s);
    s.next_tx(LENDER);

    test_scenario::with_shared!<LoanOffer<DUSDC, HBTC>>(&mut s, |offer, s| {
        test_scenario::with_shared!<Clock>(s, |clock, s| {
            protocol::cancel_offer(offer, clock, s.ctx());
        });
        assert_eq!(offer.offer_status(), protocol::status_cancelled());
        assert!(!offer.offer_has_escrow());
    });

    s.next_tx(LENDER);
    let coin = s.take_from_sender<Coin<DUSDC>>();
    assert_eq!(coin.value(), PRINCIPAL);
    coin.burn_for_testing();

    s.end();
}

#[test]
fun accepting_offer_transfers_principal_and_escrows_collateral() {
    let mut s = setup(LENDER);

    create_standard_offer(&mut s);
    s.next_tx(BORROWER);

    let collateral = coin::mint_for_testing<HBTC>(COLLATERAL, s.ctx());
    test_scenario::with_shared!<LoanRegistry<DUSDC, HBTC>>(&mut s, |registry, s| {
        test_scenario::with_shared!<LoanOffer<DUSDC, HBTC>>(s, |offer, s| {
            test_scenario::with_shared!<Clock>(s, |clock, s| {
                protocol::accept_offer(registry, offer, collateral, clock, s.ctx());
            });
            assert_eq!(offer.offer_status(), protocol::status_accepted());
            assert!(!offer.offer_has_escrow());
        });
    });

    s.next_tx(BORROWER);
    let principal = s.take_from_sender<Coin<DUSDC>>();
    assert_eq!(principal.value(), PRINCIPAL);
    principal.burn_for_testing();

    test_scenario::with_shared!<ActiveLoan<DUSDC, HBTC>>(&mut s, |loan, _s| {
        assert_eq!(loan.loan_status(), protocol::status_active());
        assert!(loan.loan_has_collateral());
    });

    s.end();
}

#[test]
fun repayment_requires_full_due_and_returns_collateral() {
    let mut s = setup(LENDER);
    accept_standard_offer(&mut s);

    s.next_tx(BORROWER);
    let repayment = coin::mint_for_testing<DUSDC>(PRINCIPAL + INTEREST, s.ctx());
    test_scenario::with_shared!<ActiveLoan<DUSDC, HBTC>>(&mut s, |loan, s| {
        test_scenario::with_shared!<Clock>(s, |clock, s| {
            protocol::repay(loan, repayment, clock, s.ctx());
        });
        assert_eq!(loan.loan_status(), protocol::status_repaid());
        assert!(!loan.loan_has_collateral());
    });

    s.next_tx(BORROWER);
    let collateral = s.take_from_sender<Coin<HBTC>>();
    assert_eq!(collateral.value(), COLLATERAL);
    collateral.burn_for_testing();

    s.next_tx(LENDER);
    let paid = s.take_from_sender<Coin<DUSDC>>();
    assert_eq!(paid.value(), PRINCIPAL + INTEREST);
    paid.burn_for_testing();

    s.end();
}

#[test]
fun default_claim_only_after_maturity() {
    let mut s = setup(LENDER);
    accept_standard_offer(&mut s);

    s.next_tx(LENDER);
    test_scenario::with_shared!<Clock>(&mut s, |clock, _s| {
        clock.increment_for_testing(DURATION_MS + 1);
    });

    s.next_tx(LENDER);
    test_scenario::with_shared!<ActiveLoan<DUSDC, HBTC>>(&mut s, |loan, s| {
        test_scenario::with_shared!<Clock>(s, |clock, s| {
            protocol::claim_default(loan, clock, s.ctx());
        });
        assert_eq!(loan.loan_status(), protocol::status_default_claimed());
        assert!(!loan.loan_has_collateral());
    });

    s.next_tx(LENDER);
    let collateral = s.take_from_sender<Coin<HBTC>>();
    assert_eq!(collateral.value(), COLLATERAL);
    collateral.burn_for_testing();

    s.end();
}

#[test, expected_failure(abort_code = 5)]
fun non_lender_cannot_cancel_offer() {
    let mut s = setup(LENDER);
    create_standard_offer(&mut s);

    s.next_tx(THIRD_PARTY);
    test_scenario::with_shared!<LoanOffer<DUSDC, HBTC>>(&mut s, |offer, s| {
        test_scenario::with_shared!<Clock>(s, |clock, s| {
            protocol::cancel_offer(offer, clock, s.ctx());
        });
    });

    s.end();
}

#[test, expected_failure(abort_code = 8)]
fun accept_requires_required_collateral() {
    let mut s = setup(LENDER);
    create_standard_offer(&mut s);

    s.next_tx(BORROWER);
    let collateral = coin::mint_for_testing<HBTC>(COLLATERAL - 1, s.ctx());
    test_scenario::with_shared!<LoanRegistry<DUSDC, HBTC>>(&mut s, |registry, s| {
        test_scenario::with_shared!<LoanOffer<DUSDC, HBTC>>(s, |offer, s| {
            test_scenario::with_shared!<Clock>(s, |clock, s| {
                protocol::accept_offer(registry, offer, collateral, clock, s.ctx());
            });
        });
    });

    s.end();
}

#[test, expected_failure(abort_code = 11)]
fun repay_requires_full_due() {
    let mut s = setup(LENDER);
    accept_standard_offer(&mut s);

    s.next_tx(BORROWER);
    let underpayment = coin::mint_for_testing<DUSDC>(PRINCIPAL + INTEREST - 1, s.ctx());
    test_scenario::with_shared!<ActiveLoan<DUSDC, HBTC>>(&mut s, |loan, s| {
        test_scenario::with_shared!<Clock>(s, |clock, s| {
            protocol::repay(loan, underpayment, clock, s.ctx());
        });
    });

    s.end();
}

#[test, expected_failure(abort_code = 13)]
fun lender_cannot_claim_before_maturity() {
    let mut s = setup(LENDER);
    accept_standard_offer(&mut s);

    s.next_tx(LENDER);
    test_scenario::with_shared!<ActiveLoan<DUSDC, HBTC>>(&mut s, |loan, s| {
        test_scenario::with_shared!<Clock>(s, |clock, s| {
            protocol::claim_default(loan, clock, s.ctx());
        });
    });

    s.end();
}

#[test, expected_failure(abort_code = 12)]
fun borrower_cannot_repay_after_maturity() {
    let mut s = setup(LENDER);
    accept_standard_offer(&mut s);

    s.next_tx(BORROWER);
    test_scenario::with_shared!<Clock>(&mut s, |clock, _s| {
        clock.increment_for_testing(DURATION_MS + 1);
    });

    s.next_tx(BORROWER);
    let repayment = coin::mint_for_testing<DUSDC>(PRINCIPAL + INTEREST, s.ctx());
    test_scenario::with_shared!<ActiveLoan<DUSDC, HBTC>>(&mut s, |loan, s| {
        test_scenario::with_shared!<Clock>(s, |clock, s| {
            protocol::repay(loan, repayment, clock, s.ctx());
        });
    });

    s.end();
}

fun setup(sender: address): Scenario {
    let mut s = test_scenario::begin(sender);
    s.create_system_objects();
    protocol::init_registry<DUSDC, HBTC>(s.ctx());
    s.next_tx(sender);
    s
}

fun create_standard_offer(s: &mut Scenario) {
    let principal = coin::mint_for_testing<DUSDC>(PRINCIPAL, s.ctx());
    test_scenario::with_shared!<LoanRegistry<DUSDC, HBTC>>(s, |registry, s| {
        test_scenario::with_shared!<Clock>(s, |clock, s| {
            protocol::create_offer(
                registry,
                principal,
                PRINCIPAL,
                INTEREST,
                COLLATERAL,
                DURATION_MS,
                EXPIRES_AT_MS,
                clock,
                s.ctx(),
            );
        });
    });
}

fun accept_standard_offer(s: &mut Scenario) {
    create_standard_offer(s);
    s.next_tx(BORROWER);

    let collateral = coin::mint_for_testing<HBTC>(COLLATERAL, s.ctx());
    test_scenario::with_shared!<LoanRegistry<DUSDC, HBTC>>(s, |registry, s| {
        test_scenario::with_shared!<LoanOffer<DUSDC, HBTC>>(s, |offer, s| {
            test_scenario::with_shared!<Clock>(s, |clock, s| {
                protocol::accept_offer(registry, offer, collateral, clock, s.ctx());
            });
        });
    });
}
