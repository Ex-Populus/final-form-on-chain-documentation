# Final Form On Chain Interaction Documentation

The follow repository supplies all necessary documentation and code to interact with the Final Form game on chain, rather than going through the game client.

## Getting started

To run this SDK NodeJS >= v16 needs to be installed.
A local wallet needs to be stored on the device running the game script.

- Clone this repository
- Run `npm install`
- Enter the path to your local wallet .json into `global.config.json` - `PATH_TO_LOCAL_KEYPAIR`

All important game keys are stored within the global.config.json.


The deployed mainnet programs are:

| Program           | Id                 |
|:------------------|:-------------------|
| Staking Program   | `HJF81gg2GzKCL9LKnd7aTXCZQ1g6c67PBBYUP64oN9Hz` |
| Portal Program    | `EcizZotuHib1X8jL5LfdeVMeWrKDEeoFQacsrEE6hNUd` |
| Evolution Program | `4oU3dU3PxFMjewruLh4nuGnXTxa95xaekiwDY5DeA3nX` |


## Gameflow

First the player has to initialize their game account, then we can start pledging cards. We can ask the blockchain for the current pledging daily rewards. After a while we can claim our accumulated CHROMOS. Once a card is pledged it cannot be transerred or listed until unpledged. Unpledging will claim all unclaimed for the card. When we have claimed enough CHROMOS we can start to evolve 4 cards of the same rarity but with unique houses. We can ask the blokchain for the current evolution costs. If we have anough CHROMOS and the required cards we can evolve and earn a whitelist token with which we can mint a new card from a higher rarity from the prepared candy machines. Legendary cards can be burned for CHROMOS rewards.


## Examples

- Create the game account


```
const txSig = await FinalFormSDK.initialize(wallet);

```

- Pledge a card


```
const txSig = await FinalFormSDK.pledgeCard(new PublicKey("2Q3jhm1MVsst9ye7LmrRbjNaMooLt6jKBdoG7bAeDgYe"), wallet);

```

- Unpledge a card


```
const txSig = await FinalFormSDK.unpledgeCard(new PublicKey("2Q3jhm1MVsst9ye7LmrRbjNaMooLt6jKBdoG7bAeDgYe"), wallet);

```

- Claim CHROMOS


```
const txSig = await FinalFormSDK.claimChromos(wallet);

```

- Evolve 4 cards (Earn a candy machine whitelist token)


``` 
const txSig = await FinalFormSDK.evolve(
    [
        new PublicKey("2Q3jhm1MVsst9ye7LmrRbjNaMooLt6jKBdoG7bAeDgYe"),
        new PublicKey("2Q3jhm1MVsst9ye7LmrRbjNaMooLt6jKBdoG7bAeDgYe"),
        new PublicKey("2Q3jhm1MVsst9ye7LmrRbjNaMooLt6jKBdoG7bAeDgYe"),
        new PublicKey("2Q3jhm1MVsst9ye7LmrRbjNaMooLt6jKBdoG7bAeDgYe")
    ],
    wallet
);

```

- Burn 1 legendary (Earn CHROMOS)


```
const txSig = await FinalFormSDK.burnLegendary(new PublicKey("2Q3jhm1MVsst9ye7LmrRbjNaMooLt6jKBdoG7bAeDgYe"), wallet);

```


Once 4 cards have been evolved successfully you will get a whitelist token in return. Each whitelist token can mint a new card from it's coresponding candy machine. The deployed candymachines mapped to their whitelist tokens are:


| Whitelist Token           | Candy Machine                     |
|:--------------------------|:----------------------------------|
| DAG RARE `73KadFNX7xRtXLn9hFUmz9qMB1tZZrfEVL8YB51yiKrV`       | `9Dw4j3U92X9j1Hbj6oTiVCi9o9cadZzvQKz1wEmUvVWZ` |
| DAG EPIC `4h8mu3aTFaWVrtMAExiEuSy5EjeG3UktCrr1LHBNAxUz`       | `5J8nKa2yr6MSqaAhyjQ9sbV5eZxMNvVcHdPm7utryouv` |
| DAG LEGENDARY `8jbSppGXTgmkDGps7XKpvwAkS1pbBcNjvWJvZWwGCnmn`  | `FqWxNzu8U96ptrMzcNVPEzuoV9v7JzTY72mJ7d831Z8N` |

Metaplex candy machine documentation: https://github.com/metaplex-foundation/metaplex-program-library/tree/master/candy-machine/js