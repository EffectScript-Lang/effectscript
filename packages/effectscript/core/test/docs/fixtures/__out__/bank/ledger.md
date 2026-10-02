---
title: "bank/ledger"
---

## Ledger

```efx
service Ledger
```

The store of balances.

| | |
| --- | --- |
| **Ledger.layerTest** | `Layer<Ledger>` |

### Ledger.balance

```efx
effect balance(id: AccountId): Money throws AccountNotFound
```

The balance of one account.

| | |
| --- | --- |
| **id** | [`AccountId`](./accounts.md#accountid): An account id. |
| **Returns** | [`Money`](./accounts.md#money): An amount of money in whole cents. |
| **Fails with** | [`AccountNotFound`](./accounts.md#accountnotfound): No account has this id. |
