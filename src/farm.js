const { PublicKey, Transaction,
    SystemProgram, Keypair,
    SYSVAR_RENT_PUBKEY } = require("@solana/web3.js");
const { TOKEN_PROGRAM_ID } = require('@solana/spl-token');
const { Program, BN, AnchorProvider } = require("@project-serum/anchor");
const bs58 = require('bs58');

const { getConnection, sendTransaction, findATA, createTokenAccount, waitForTransaction, GLOBAL_CONFIG, RARITY } = require("./utils");
const { getWLConfig, getRewardConfig } = require('./evolution');
const StakingIDL = require('./idl/staking.json');

const METAPLEX = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');

const GLOBAL_AUTHORITY_SEED = "global-authority"; //Constant string to hash Staking-Program PDAs
const PORTAL_AUTHORITY_SEED = "portal-authority"; //Constant string to hash Potal-Program PDAs
const USER_POOL_SIZE = 5696;
const FARM_POOL_SIZE = 160;

const CHROMOS = new PublicKey(GLOBAL_CONFIG.CHROMOS);
const STAKING_PROGRAM_ID = new PublicKey(GLOBAL_CONFIG.STAKING_PROGRAM_ID);
const PORTAL_PROGRAM_ID = new PublicKey(GLOBAL_CONFIG.PORTAL_PROGRAM_ID);
const FARMS_BY_RARITY = [new PublicKey(GLOBAL_CONFIG.FARMS_BY_RARITY[0]), new PublicKey(GLOBAL_CONFIG.FARMS_BY_RARITY[1]), new PublicKey(GLOBAL_CONFIG.FARMS_BY_RARITY[2])];

let cachedStakingProgram = null;
const getStakingProgram = () => {
    if (!cachedStakingProgram) {
        cachedStakingProgram = new Program(StakingIDL, STAKING_PROGRAM_ID, new AnchorProvider(getConnection(), Keypair.generate(), AnchorProvider.defaultOptions()));
    }
    return cachedStakingProgram;
}

const initUserPool = async (
    userWallet
) => {
    let userPoolKey = await PublicKey.createWithSeed(
        userWallet.publicKey,
        "user-pool",
        STAKING_PROGRAM_ID,
    );

    const userPoolState = await getUserPoolState(userWallet.publicKey);

    let tx = new Transaction();

    if (userPoolState == null) {
        let ix = SystemProgram.createAccountWithSeed({
            fromPubkey: userWallet.publicKey,
            basePubkey: userWallet.publicKey,
            seed: "user-pool",
            newAccountPubkey: userPoolKey,
            lamports: await getConnection().getMinimumBalanceForRentExemption(USER_POOL_SIZE),
            space: USER_POOL_SIZE,
            programId: STAKING_PROGRAM_ID,
        });
        tx.add(ix);
        tx.add(getStakingProgram().instruction.initializeUserPool(
            {
                accounts: {
                    userPool: userPoolKey,
                    owner: userWallet.publicKey
                },
                instructions: [],
                signers: []
            }
        ));
    }

    for (let rarity = 0; rarity < 3; rarity++) {
        for (let set = 0; set < 2; set++) { //TODO we need to know how many sets exist
            const config = await getRewardConfig(rarity, set);
            if (config == null) {
                console.log("No config for", rarity, set);
                continue;
            }
            const mint = config.account.rewardToken;
            let userRewardAccount = await findATA(mint, userWallet.publicKey);
            let fetchedAccount = await getConnection().getAccountInfo(userRewardAccount);
            if (!fetchedAccount) {
                const sig = await createTokenAccount(mint, userWallet.publicKey, userWallet.publicKey, true, userWallet);
                await waitForTransaction(sig.txSig);
            }
        }
    }

    if (tx.instructions.length == 0) {
        return null;
    }

    const txSig = await sendTransaction({
        connection: getConnection(),
        tx,
        wallet: userWallet
    });

    return {
        txSig,
    };
}

const stakeNFT = async (
    mint,
    userWallet
) => {
    const userAddress = userWallet.publicKey;
    let userPoolKey = await PublicKey.createWithSeed(
        userAddress,
        "user-pool",
        STAKING_PROGRAM_ID,
    );

    const [globalAuthority, bump] = await PublicKey.findProgramAddress(
        [Buffer.from(GLOBAL_AUTHORITY_SEED)],
        STAKING_PROGRAM_ID,
    );

    let userTokenAccount = await findATA(mint, userAddress);

    const [destinationAccount, _] = await PublicKey.findProgramAddress(
        [Buffer.from(GLOBAL_AUTHORITY_SEED), mint.toBuffer()],
        STAKING_PROGRAM_ID
    );

    const { wlConfigPDA, account, metadataPDA } = await getWLConfig(mint);
    const { farmPDA } = await getFarmByRarity(account.rarity);

    let tx = new Transaction();

    tx.add(getStakingProgram().instruction.stakeNftToPool(
        bump, {
        accounts: {
            owner: userAddress,
            userPool: userPoolKey,
            farmPool: farmPDA,
            globalAuthority,
            userNftTokenAccount: userTokenAccount,
            destNftTokenAccount: destinationAccount,
            nftMint: mint,
            wlConfig: wlConfigPDA,
            mintMetadata: metadataPDA,
            tokenProgram: TOKEN_PROGRAM_ID,
            tokenMetadataProgram: METAPLEX,
            systemProgram: SystemProgram.programId,
            rent: SYSVAR_RENT_PUBKEY,
        }
    }));


    const txSig = await sendTransaction({
        connection: getConnection(),
        tx,
        wallet: userWallet
    });

    return { txSig };
}

const unstakeNFT = async (
    mint,
    userWallet
) => {
    const userAddress = userWallet.publicKey;

    let userTokenAccount = await findATA(mint, userAddress);
    let fetchedAccount = await getConnection().getAccountInfo(userTokenAccount);
    if (!fetchedAccount) {
        const sig = await createTokenAccount(mint, userAddress, userWallet.publicKey, true, userWallet);
        await waitForTransaction(sig.txSig);
    }
    let userRewardAccount = await findATA(CHROMOS, userAddress);
    fetchedAccount = await getConnection().getAccountInfo(userRewardAccount);
    if (!fetchedAccount) {
        const sig = await createTokenAccount(CHROMOS, userAddress, userWallet.publicKey, true, userWallet);
        await waitForTransaction(sig.txSig);
    }

    const [globalAuthority, bump] = await PublicKey.findProgramAddress(
        [Buffer.from(GLOBAL_AUTHORITY_SEED)],
        STAKING_PROGRAM_ID
    );
    const [chromosPortal] = await PublicKey.findProgramAddress(
        [Buffer.from(PORTAL_AUTHORITY_SEED)],
        PORTAL_PROGRAM_ID
    );

    const [portalProof] = await PublicKey.findProgramAddress(
        [globalAuthority.toBuffer()],
        PORTAL_PROGRAM_ID
    );

    let userPoolKey = await PublicKey.createWithSeed(
        userAddress,
        "user-pool",
        STAKING_PROGRAM_ID,
    );

    const [destNftTokenAccount, _] = await PublicKey.findProgramAddress(
        [Buffer.from(GLOBAL_AUTHORITY_SEED), mint.toBuffer()],
        STAKING_PROGRAM_ID
    );

    const { account } = await getWLConfig(mint);
    const { farmPDA } = await getFarmByRarity(account.rarity);

    const [reportData] = await PublicKey.findProgramAddress(
        [Buffer.from("counter"), farmPDA.toBuffer()],
        PORTAL_PROGRAM_ID,
    );

    let tx = new Transaction();
    tx.add(getStakingProgram().instruction.unstakeNftFromPool(
        bump, {
        accounts: {
            owner: userAddress,
            userPool: userPoolKey,
            farmPool: farmPDA,
            globalAuthority,
            userNftTokenAccount: userTokenAccount,
            destNftTokenAccount,
            userRewardAccount,
            rewardMint: CHROMOS,
            nftMint: mint,
            chromosPortal,
            portalProgram: PORTAL_PROGRAM_ID,
            portalProof,
            tokenProgram: TOKEN_PROGRAM_ID,
            reportData
        },
        instructions: [],
        signers: [],
    }));

    const txSig = await sendTransaction({
        connection: getConnection(),
        tx,
        wallet: userWallet
    });

    return { txSig };
}

const claimReward = async (
    userWallet
) => {
    const userAddress = userWallet.publicKey;

    let userRewardAccount = await findATA(CHROMOS, userAddress);
    fetchedAccount = await getConnection().getAccountInfo(userRewardAccount);
    if (!fetchedAccount) {
        const sig = await createTokenAccount(CHROMOS, userAddress, userWallet.publicKey, true, userWallet);
        await waitForTransaction(sig.txSig);
    }

    const [globalAuthority, bump] = await PublicKey.findProgramAddress(
        [Buffer.from(GLOBAL_AUTHORITY_SEED)],
        STAKING_PROGRAM_ID
    );

    const [chromosPortal] = await PublicKey.findProgramAddress(
        [Buffer.from(PORTAL_AUTHORITY_SEED)],
        PORTAL_PROGRAM_ID
    );

    const [portalProof] = await PublicKey.findProgramAddress(
        [globalAuthority.toBuffer()],
        PORTAL_PROGRAM_ID
    );

    let userPoolKey = await PublicKey.createWithSeed(
        userAddress,
        "user-pool",
        STAKING_PROGRAM_ID,
    );

    const [reportDataCommon] = await PublicKey.findProgramAddress(
        [Buffer.from("counter"), FARMS_BY_RARITY[0].toBuffer()],
        PORTAL_PROGRAM_ID,
    );

    let tx = new Transaction();

    tx.add(getStakingProgram().instruction.claimRewards(
        bump, {
        accounts: {
            owner: userAddress,
            userPool: userPoolKey,
            farmPool: FARMS_BY_RARITY[0],
            globalAuthority,
            userRewardAccount,
            rewardMint: CHROMOS,
            chromosPortal,
            portalProgram: PORTAL_PROGRAM_ID,
            portalProof,
            tokenProgram: TOKEN_PROGRAM_ID,
            reportData: reportDataCommon
        },
        instructions: [],
        signers: [],
    }));

    const [reportDataRare] = await PublicKey.findProgramAddress(
        [Buffer.from("counter"), FARMS_BY_RARITY[1].toBuffer()],
        PORTAL_PROGRAM_ID,
    );
    tx.add(getStakingProgram().instruction.claimRewards(
        bump, {
        accounts: {
            owner: userAddress,
            userPool: userPoolKey,
            farmPool: FARMS_BY_RARITY[1],
            globalAuthority,
            userRewardAccount,
            rewardMint: CHROMOS,
            chromosPortal,
            portalProgram: PORTAL_PROGRAM_ID,
            portalProof,
            tokenProgram: TOKEN_PROGRAM_ID,
            reportData: reportDataRare
        },
        instructions: [],
        signers: [],
    }));

    const [reportDataEpic] = await PublicKey.findProgramAddress(
        [Buffer.from("counter"), FARMS_BY_RARITY[2].toBuffer()],
        PORTAL_PROGRAM_ID,
    );
    tx.add(getStakingProgram().instruction.claimRewards(
        bump, {
        accounts: {
            owner: userAddress,
            userPool: userPoolKey,
            farmPool: FARMS_BY_RARITY[2],
            globalAuthority,
            userRewardAccount,
            rewardMint: CHROMOS,
            chromosPortal,
            portalProgram: PORTAL_PROGRAM_ID,
            portalProof,
            tokenProgram: TOKEN_PROGRAM_ID,
            reportData: reportDataEpic
        },
        instructions: [],
        signers: [],
    }));

    const txSig = await sendTransaction({
        connection: getConnection(),
        tx,
        wallet: userWallet
    });

    return { txSig };
}

const calculateRewards = async (
    userPoolAccount
) => {
    try {
        const userPool = userPoolAccount;
        if (userPool === null) return 0;

        const farms = await getAllFarms();
        if (farms.length == 0) return 0;

        const farmMap = {};
        farms.forEach(f => {
            farmMap[f.account.farmNumber.toString()] = { tierDuration: f.account.tierDuration, tierRate: f.account.tierRate }
        });


        let slot = await getConnection().getSlot();
        let now = await getConnection().getBlockTime(slot);
        if (now === null) return 0;

        let reward = 0;
        const userStakedCount = userPool.stakedCount.toNumber();

        for (let i = 0; i < userStakedCount; i++) {
            const nftStakingInfo = userPool.staking[i];
            let duration = now - nftStakingInfo.claimedTime.toNumber();
            const farmData = farmMap[nftStakingInfo.farmNumber.toString()];

            const rewardFactor = farmData.tierRate[0].toNumber();
            reward += (duration * rewardFactor) / 86400;
        }
        return reward;

    } catch (ex) {
        return 0;
    }
}

const getUserPoolState = async (userAddress) => {
    let userPoolKey = await PublicKey.createWithSeed(
        userAddress,
        "user-pool",
        STAKING_PROGRAM_ID,
    );
    try {
        let userPoolState = await getStakingProgram().account.userPool.fetch(userPoolKey);
        return { userPoolState, userPoolKey };
    } catch (ex) {
        // console.log(ex);
        return null;
    }
}

const getAllStakedNFTsOfUser = async (userAddress) => {
    let userPoolKey = await PublicKey.createWithSeed(
        userAddress,
        "user-pool",
        STAKING_PROGRAM_ID,
    );
    let userPoolAccount;
    try {
        userPoolAccount = await getStakingProgram().account.userPool.fetch(userPoolKey);
    } catch (ex) {
        return null;
    }

    const stakedData = {
        stakedCountTotal: userPoolAccount.stakedCount.toNumber(),
        common: [],
        rare: [],
        epic: []
    }

    userPoolAccount.staking.slice(0, userPoolAccount.stakedCount.toNumber()).forEach((info) => {
        const rarity = info.farmNumber.toNumber() == 1 ? 'common' : info.farmNumber.toNumber() == 2 ? "rare" : "epic";
        stakedData[rarity].push({
            mint: info.mint.toBase58(),
            rarity: info.farmNumber.toNumber(),
            stakedTime: info.stakedTime.toNumber(),
            claimedTime: info.claimedTime.toNumber(),
        })
    });

    return stakedData;
};


const getAllFarms = async () => {
    try {
        let farmStates = await getStakingProgram().account.farmData.all();
        return farmStates;
    } catch {
        return [];
    }
}

const getDailyRewards = async () => {

    return {
        common: Number((await getFarmByRarity(RARITY.COMMON)).account.tierRate[0].toString()),
        rare: Number((await getFarmByRarity(RARITY.RARE)).account.tierRate[0].toString()),
        epic: Number((await getFarmByRarity(RARITY.EPIC)).account.tierRate[0].toString())
    }
}

const getFarmByRarity = async (rarity) => {
    try {
        const filter = [{
            dataSize: FARM_POOL_SIZE,
        }];
        filter.push({
            memcmp: {
                offset: 105,
                bytes: bs58.encode((new BN(rarity, 'le')).toArray()),
            },
        });

        const foundFarms = (await getStakingProgram().account.farmData.all(filter));

        if (!foundFarms || !foundFarms.length) {
            return null;
        }

        return { farmPDA: foundFarms[0].publicKey, account: foundFarms[0].account }
    } catch (ex) {
        return null;
    }
}

module.exports = {
    initUserPool,
    stakeNFT,
    unstakeNFT,
    claimReward,
    calculateRewards,
    getAllStakedNFTsOfUser,
    getDailyRewards
}