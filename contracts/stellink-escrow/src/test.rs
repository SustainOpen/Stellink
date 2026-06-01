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
    let recipient = Address::generate(&env);
    let link_id = BytesN::from_array(&env, &[1u8; 32]);
    let metadata_hash = BytesN::from_array(&env, &[2u8; 32]);

    client.register_link(&creator, &Some(recipient.clone()), &link_id, &None, &metadata_hash);

    let record = client.get_link(&link_id).expect("link should exist");
    assert_eq!(record.creator, creator);
    assert_eq!(record.recipient, Some(recipient));
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

    client.register_link(&creator, &None, &link_id, &None, &metadata_hash);
    // Second call with same id must fail.
    client.register_link(&creator, &None, &link_id, &None, &metadata_hash);
}

#[test]
fn test_appeal_and_resolve_flow() {
    let (env, _arbiter, client) = setup();
    let creator = Address::generate(&env);
    let recipient = Address::generate(&env);
    let link_id = BytesN::from_array(&env, &[5u8; 32]);
    let metadata_hash = BytesN::from_array(&env, &[6u8; 32]);

    client.register_link(&creator, &Some(recipient.clone()), &link_id, &None, &metadata_hash);

    // Creator appeals
    client.appeal_link(&link_id, &creator);

    let record = client.get_link(&link_id).unwrap();
    assert!(record.appealed);

    // Arbiter resolves
    client.resolve_appeal(&link_id, &1);

    let record = client.get_link(&link_id).unwrap();
    assert_eq!(record.decision, 1);
}

#[test]
fn test_appeal_recipient_authorized() {
    let (env, _, client) = setup();
    let creator = Address::generate(&env);
    let recipient = Address::generate(&env);
    let link_id = BytesN::from_array(&env, &[7u8; 32]);
    let metadata_hash = BytesN::from_array(&env, &[8u8; 32]);

    client.register_link(&creator, &Some(recipient.clone()), &link_id, &None, &metadata_hash);

    // Recipient appeals
    client.appeal_link(&link_id, &recipient);

    let record = client.get_link(&link_id).unwrap();
    assert!(record.appealed);
}

#[test]
#[should_panic(expected = "Error(Contract, #3)")]
fn test_appeal_unauthorized_caller() {
    let (env, _, client) = setup();
    let creator = Address::generate(&env);
    let recipient = Address::generate(&env);
    let bystander = Address::generate(&env);
    let link_id = BytesN::from_array(&env, &[9u8; 32]);
    let metadata_hash = BytesN::from_array(&env, &[10u8; 32]);

    client.register_link(&creator, &Some(recipient), &link_id, &None, &metadata_hash);

    // Bystander attempts to appeal -> should fail (Unauthorised)
    client.appeal_link(&link_id, &bystander);
}

#[test]
#[should_panic]
fn test_resolve_unauthorized_caller() {
    let (env, _, client) = setup();
    let creator = Address::generate(&env);
    let recipient = Address::generate(&env);
    let link_id = BytesN::from_array(&env, &[11u8; 32]);
    let metadata_hash = BytesN::from_array(&env, &[12u8; 32]);

    client.register_link(&creator, &Some(recipient), &link_id, &None, &metadata_hash);
    client.appeal_link(&link_id, &creator);

    // Disable mock auth to verify that require_auth fails without arbiter signature
    env.mock_auths(&[]);
    client.resolve_appeal(&link_id, &1);
}

#[test]
#[should_panic(expected = "Error(Contract, #3)")]
fn test_resolve_not_appealed() {
    let (env, _, client) = setup();
    let creator = Address::generate(&env);
    let recipient = Address::generate(&env);
    let link_id = BytesN::from_array(&env, &[13u8; 32]);
    let metadata_hash = BytesN::from_array(&env, &[14u8; 32]);

    client.register_link(&creator, &Some(recipient), &link_id, &None, &metadata_hash);

    // Arbiter attempts to resolve before appeal -> should fail (Unauthorised)
    client.resolve_appeal(&link_id, &1);
}
