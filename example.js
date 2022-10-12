const { loadLocalWallet } = require('./src/utils');

const FinalFormSDK = require('./src/index');

const wallet = loadLocalWallet();

//Create Game Account
async () => {
    const txSig = await FinalFormSDK.initialize(wallet);
}

//Get pledge rewards
async () => {
    const rewards = await FinalFormSDK.getPledgeDailyRewardsPerCard(wallet);
    // {
    //     common: 100000,
    //     rare: 550000000,
    //     epic: 650000000
    // }
}

//Pledge card
async () => {
    const txSig = await FinalFormSDK.pledgeCard(new PublicKey("2Q3jhm1MVsst9ye7LmrRbjNaMooLt6jKBdoG7bAeDgYe"), wallet);
}

//Claim Chromos
async () => {
    const txSig = await FinalFormSDK.claimChromos(wallet);
}

//Unpledge card
async () => {
    const txSig = await FinalFormSDK.unpledgeCard(new PublicKey("2Q3jhm1MVsst9ye7LmrRbjNaMooLt6jKBdoG7bAeDgYe"), wallet);
}

//Get evolution cost / legendary reward
async () => {
    const rewards = await FinalFormSDK.getEvolveConfigs(wallet);
    // {
    //     common: 9000000,
    //     rare: 1485000000000,
    //     epic: 2340000000000,
    //     legendary: 9360000000000
    // }
}

//Evolve 4 cards of same rarity and unique house
async () => {
    const txSig = await FinalFormSDK.evolve(
        [
            new PublicKey("2Q3jhm1MVsst9ye7LmrRbjNaMooLt6jKBdoG7bAeDgYe"),
            new PublicKey("2Q3jhm1MVsst9ye7LmrRbjNaMooLt6jKBdoG7bAeDgYe"),
            new PublicKey("2Q3jhm1MVsst9ye7LmrRbjNaMooLt6jKBdoG7bAeDgYe"),
            new PublicKey("2Q3jhm1MVsst9ye7LmrRbjNaMooLt6jKBdoG7bAeDgYe")
        ],
        wallet
    );
}

//Burn 1 legendary
async () => {
    const txSig = await FinalFormSDK.burnLegendary(new PublicKey("2Q3jhm1MVsst9ye7LmrRbjNaMooLt6jKBdoG7bAeDgYe"), wallet);
}