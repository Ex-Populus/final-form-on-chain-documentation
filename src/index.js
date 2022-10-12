const { RARITY } = require('./utils');
const CustomFarm = require('./farm');
const Evolution = require('./evolution');

module.exports = FinalFormSDK = {

    initialize: async (wallet) => {
        const result = await CustomFarm.initUserPool(wallet);
        if (result != null) {
            return result.txSig;
        }
        return null;
    },
    getPledgeDailyRewardsPerCard: async () => {
        return (await CustomFarm.getDailyRewards());
    },
    getPledgedCardsInfo: async (walletAddress) => {
        return (await CustomFarm.getAllStakedNFTsOfUser(walletAddress));
    },
    pledgeCard: async (card, wallet) => {
        const result = await CustomFarm.stakeNFT(card, wallet);
        return result.txSig;
    },
    claimChromos: async (wallet) => {
        const result = await CustomFarm.claimReward(wallet);
        return result.txSig;
    },
    unpledgeCard: async (card, wallet) => {
        const result = await CustomFarm.unstakeNFT(card, wallet);
        return result.txSig;
    },
    getEvolveConfigs: async () => {
        return (await Evolution.getEvolutionConfig());
    },
    evolve: async (cards, wallet) => {
        const result = await Evolution.evolve(cards, wallet);
        return result.txSig;
    },
    burnLegendary: async (card, wallet) => {
        const result = await Evolution.burnLegendary(card, wallet);
        return result.txSig;
    }
}