#![cfg(test)]

use super::*;
use soroban_sdk::{testutils::Address as _, Env, BytesN};

fn setup() -> (Env, Address, StellinkEscrowClient<'static>) {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, StellinkEscrow);
    let client = StellinkEscrowClient::new(&env, &contract_id);

    let arbiter = Address::generate(&env);
    client.init(&Some(arbiter.clone()));

    (env, arbiter, client)
}

#[test]
fn init_sets_arbiter() {
    let (_env, arbiter, client) = setup();
    assert_eq!(client.arbiter(), Some(arbiter));
}

#[test]
fn register_and_fetch_link() {
    let (env, _, client) = setup();
    let creator = Address::generate(&env);
    let link_id = BytesN::from_array(&env, &[1u8; 32]);
    let metadata_hash = BytesN::from_array(&env, &[2u8; 32]);

    client.register_link(&creator, &link_id, &None, &metadata_hash);

    let record = client.get_link(&link_id).expect("link should exist");
    assert_eq!(record.creator, creator);
    assert_eq!(record.metadata_hash, metadata_hash);
    assert!(record.claimable_balance_id.is_none());
}

#[test]
#[should_panic(expected = "Error(Contract, #1)")]
fn duplicate_link_rejected() {
    let (env, _, client) = setup();
    let creator = Address::generate(&env);
    let link_id = BytesN::from_array(&env, &[3u8; 32]);
    let metadata_hash = BytesN::from_array(&env, &[4u8; 32]);

    client.register_link(&creator, &link_id, &None, &metadata_hash);
    // Second call with same id must fail.
    client.register_link(&creator, &link_id, &None, &metadata_hash);
}

#[test]
#[should_panic(expected = "Error(Contract, #100)")]
fn appeal_is_not_implemented_yet() {
    let (env, _, client) = setup();
    let caller = Address::generate(&env);
    let link_id = BytesN::from_array(&env, &[5u8; 32]);
    client.appeal_link(&link_id, &caller);
}
