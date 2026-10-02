---
title: "bank/transfer"
description: "Bank transfers between accounts."
---

Bank transfers between accounts.

## Receipt

```efx
schema Receipt
```

Proof that a transfer happened.

| | |
| --- | --- |
| **amount** | [`Money`](./accounts.md#money): The amount moved. |

## transfer

```efx
effect transfer(from: AccountId, to: AccountId, amount: Money): Receipt throws InsufficientFunds | AccountNotFound needs Ledger
```

Moves money between two accounts.

| | |
| --- | --- |
| **from** | [`AccountId`](./accounts.md#accountid): An account id. |
| **to** | [`AccountId`](./accounts.md#accountid): An account id. |
| **amount** | [`Money`](./accounts.md#money): An amount of money in whole cents. |
| **Returns** | [`Receipt`](#receipt): Proof that a transfer happened. |
| **Fails with** | [`InsufficientFunds`](./accounts.md#insufficientfunds): An account has less money than the transfer needs.<br>[`AccountNotFound`](./accounts.md#accountnotfound): No account has this id. |
| **Needs** | [`Ledger`](./ledger.md#ledger): The store of balances. |

Both balances change, or neither does.

Moving money:

```efx
const receipt = await transfer(AccountId.make("a"), AccountId.make("b"), Money.make(30))
receipt.amount // => 30
```

- **@since** 1.2.0
