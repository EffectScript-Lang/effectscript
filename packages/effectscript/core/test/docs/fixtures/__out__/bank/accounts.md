---
title: "bank/accounts"
description: "Accounts and money."
---

Accounts and money.

## Money

```efx
schema Money = Int & Brand<"Money">
```

An amount of money in whole cents.

## AccountId

```efx
schema AccountId = string & Brand<"AccountId">
```

An account id.

## AccountNotFound

```efx
error AccountNotFound
```

No account has this id.

| | |
| --- | --- |
| **id** | [`AccountId`](#accountid): An account id. |

## InsufficientFunds

```efx
error InsufficientFunds
```

An account has less money than the transfer needs.

| | |
| --- | --- |
| **needed** | [`Money`](#money): An amount of money in whole cents. |
| **available** | [`Money`](#money): An amount of money in whole cents. |
