const { PublicKey, Transaction,
    Keypair,
    SYSVAR_CLOCK_PUBKEY, ComputeBudgetProgram } = require("@solana/web3.js");
const { TOKEN_PROGRAM_ID } = require('@solana/spl-token');
const { Metadata } = require('@metaplex-foundation/mpl-token-metadata');
const { Program, AnchorProvider, utils } = require("@project-serum/anchor");
const bs58 = require('bs58');

const { getConnection, sendTransaction, findATA, createTokenAccount, waitForTransaction, GLOBAL_CONFIG, RARITY } = require("./utils");

const EvolutionIDL = require('./idl/evolution.json');
const PORTAL_AUTHORITY_SEED = "portal-authority";

const CHROMOS = new PublicKey(GLOBAL_CONFIG.CHROMOS);
const EVOLUTION_PROGRAM_ID = new PublicKey(GLOBAL_CONFIG.EVOLUTION_PROGRAM_ID);
const PORTAL_PROGRAM_ID = new PublicKey(GLOBAL_CONFIG.PORTAL_PROGRAM_ID);

let cachedEvolutionProgram = null;
const getEvolutionProgram = (userWallet) => {
    if (!cachedEvolutionProgram) {
        cachedEvolutionProgram = new Program(EvolutionIDL, EVOLUTION_PROGRAM_ID, new AnchorProvider(getConnection(), Keypair.generate(), AnchorProvider.defaultOptions()));
    }
    return cachedEvolutionProgram;
}

async function getRewardConfigPda(rarity, set) {
    const [_rewardConfigPda, _rewardConfigBump] = await PublicKey.findProgramAddress(
        [Buffer.from(utils.bytes.utf8.encode("reward-config")), Buffer.from([rarity]), Buffer.from([set])],
        EVOLUTION_PROGRAM_ID
    );
    return [_rewardConfigPda, _rewardConfigBump]
}

async function getRewardVaultPda(rewardToken) {
    const [_rewardVaultPda, _rewardVaultBump] = await PublicKey.findProgramAddress(
        [Buffer.from(utils.bytes.utf8.encode("reward-vault")), rewardToken.toBuffer()],
        EVOLUTION_PROGRAM_ID
    );
    return [_rewardVaultPda, _rewardVaultBump];
}

async function getConfigPda() {
    const [_configPda, _configBump] = await PublicKey.findProgramAddress(
        [Buffer.from(utils.bytes.utf8.encode("config"))],
        EVOLUTION_PROGRAM_ID
    );
    return [_configPda, _configBump];
}

const evolve = async (
    mints,
    userWallet
) => {

    const [_configPda, _configBump] = await getConfigPda();

    const userChromosAccount = await findATA(CHROMOS, userWallet.publicKey);

    const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
        units: 1000000
    });

    const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: 1
    });
    let tx = new Transaction();

    tx.add(modifyComputeUnits)
        .add(addPriorityFee);

    const rewardConfigs = [];
    const rewardVaults = [];
    const remainingAccounts = [];
    const userRewardAccounts = [];
    const userRewardAccountsString = [];
    const userNftAccounts = [];
    const wlConfigs = [];


    for (let i = 0; i < mints.length; i++) {
        const nft = mints[i];

        const wlConfig = await getWLConfig(nft);
        if (!wlConfig) {
            throw "Error no whitelist config for mint found";
        }

        const set = wlConfig.account.set;
        const house = wlConfig.account.house;
        const rarity = wlConfig.account.rarity;
        console.log("parsing NFT", i, rarity, house, set);

        const rewardConfig = await getRewardConfig(rarity, set);
        const configState = rewardConfig.account;
        const [_rewardVaultPda, _] = await getRewardVaultPda(configState.rewardToken);

        rewardConfigs.push(rewardConfig.rewardConfigPDA);
        rewardVaults.push(_rewardVaultPda);

        wlConfigs.push(wlConfig.wlConfigPDA);
        remainingAccounts.push({ pubkey: wlConfig.metadataPDA, isSigner: false, isWritable: false });

        let associatedTokenAddress = await findATA(configState.rewardToken, userWallet.publicKey);
        const fetchedDestAccount = await getConnection().getAccountInfo(associatedTokenAddress);

        if (!fetchedDestAccount && userRewardAccountsString.indexOf(associatedTokenAddress.toBase58()) == -1) {
            const sig = await createTokenAccount(configState.rewardToken, userWallet.publicKey, userWallet.publicKey, true, userWallet);
            await waitForTransaction(sig.txSig);
        }

        userRewardAccounts.push(associatedTokenAddress);
        userRewardAccountsString.push(associatedTokenAddress.toBase58());

        const mintAccount = await findATA(nft, userWallet.publicKey);
        userNftAccounts.push(mintAccount);
    }

    const [chromosPortal] = await PublicKey.findProgramAddress(
        [Buffer.from(PORTAL_AUTHORITY_SEED)],
        PORTAL_PROGRAM_ID
    );

    const [portalProof] = await PublicKey.findProgramAddress(
        [_configPda.toBuffer()],
        PORTAL_PROGRAM_ID
    );

    tx.add(
        getEvolutionProgram(userWallet).instruction.evolve(
            {
                accounts: {
                    config: _configPda,
                    payer: userWallet.publicKey,
                    userChromosAccount,
                    wlConfig0: wlConfigs[0],
                    wlConfig1: wlConfigs[1],
                    wlConfig2: wlConfigs[2],
                    wlConfig3: wlConfigs[3],
                    rewardConfig0: rewardConfigs[0],
                    rewardConfig1: rewardConfigs[1],
                    rewardConfig2: rewardConfigs[2],
                    rewardConfig3: rewardConfigs[3],
                    rewardVault0: rewardVaults[0],
                    rewardVault1: rewardVaults[1],
                    rewardVault2: rewardVaults[2],
                    rewardVault3: rewardVaults[3],
                    userRewardAccount0: userRewardAccounts[0],
                    userRewardAccount1: userRewardAccounts[1],
                    userRewardAccount2: userRewardAccounts[2],
                    userRewardAccount3: userRewardAccounts[3],
                    mintNft0: mints[0],
                    mintNft1: mints[1],
                    mintNft2: mints[2],
                    mintNft3: mints[3],
                    chromos: CHROMOS,
                    userNftAccount0: userNftAccounts[0],
                    userNftAccount1: userNftAccounts[1],
                    userNftAccount2: userNftAccounts[2],
                    userNftAccount3: userNftAccounts[3],
                    chromosPortal,
                    portalProgram: PORTAL_PROGRAM_ID,
                    portalProof,
                    clock: SYSVAR_CLOCK_PUBKEY,
                    tokenProgram: TOKEN_PROGRAM_ID
                },
                remainingAccounts: remainingAccounts
            }
        ));

    const txSig = await sendTransaction({
        connection: getConnection(),
        tx,
        wallet: userWallet
    });

    return {
        txSig,
    };
}


const burnLegendary = async (
    mint,
    userWallet
) => {

    const [_configPda, _configBump] = await getConfigPda();

    const { rewardConfigPDA } = await getRewardConfig(3, 0);

    const { wlConfigPDA, metadataPDA } = await getWLConfig(mint);
    const userNftAccount = await findATA(mint, userWallet.publicKey);

    const [chromosPortal] = await PublicKey.findProgramAddress(
        [Buffer.from(PORTAL_AUTHORITY_SEED)],
        PORTAL_PROGRAM_ID
    );

    const [portalProof] = await PublicKey.findProgramAddress(
        [_configPda.toBuffer()],
        PORTAL_PROGRAM_ID
    );

    const [reportData] = await PublicKey.findProgramAddress(
        [Buffer.from("counter"), _configPda.toBuffer()],
        PORTAL_PROGRAM_ID,
    );

    let tx = new Transaction();

    const userChromosAccount = await findATA(CHROMOS, userWallet.publicKey);
    const fetchedDestAccount = await getConnection().getAccountInfo(associatedTokenAddress);
    if (!fetchedDestAccount) {
        const sig = await createTokenAccount(CHROMOS, userWallet.publicKey, userWallet.publicKey, true, userWallet);
        await waitForTransaction(sig.txSig);
    }

    tx.add(
        getEvolutionProgram(userWallet).transaction.burnLegendary({
            accounts: {
                config: _configPda,
                payer: userWallet.publicKey,
                chromos: CHROMOS,
                userChromosAccount,
                rewardConfig: rewardConfigPDA,
                wlConfig: wlConfigPDA,
                nftMetadata: metadataPDA,
                legendaryMint: mint,
                userNftAccount,
                chromosPortal,
                portalProgram: PORTAL_PROGRAM_ID,
                portalProof,
                tokenProgram: TOKEN_PROGRAM_ID,
                reportData
            },
        }
        ));

    const txSig = await sendTransaction({
        connection: getConnection(),
        tx,
        wallet: userWallet
    });

    return {
        txSig,
    };
}

const getRewardConfig = async (rarity, set) => {
    try {
        const [rewardConfigPDA, _configBump] = await getRewardConfigPda(rarity, set);
        const configState = await getEvolutionProgram().account.rewardConfig.fetch(rewardConfigPDA);
        return { rewardConfigPDA, account: configState }
    } catch (ex) {
        // console.log(ex);
        return null;
    }
}

const getMxMetadata = async (
    mint,
    connection
) => {
    let metadataPDA = await Metadata.getPDA(mint);
    const account = await Metadata.load(connection, metadataPDA);
    return { onChain: account.data, metadataPDA };
};


const getWLConfig = async (mint) => {
    let uri;
    let metadataPDA;
    try {
        const metaplexAccount = await getMxMetadata(mint, getConnection());
        uri = metaplexAccount.onChain.data.uri;
        metadataPDA = metaplexAccount.metadataPDA;
    } catch (ex) {
        console.error("Failed to load metadata", ex);
        return null;
    }

    try {
        const filter = [{
            dataSize: 192,
        }];
        filter.push({
            memcmp: {
                offset: 12,
                bytes: bs58.encode(Buffer.from(utils.bytes.utf8.encode(uri))),
            },
        });

        const fouldWLConfig = (await getEvolutionProgram().account.wlConfig.all(filter));

        if (!fouldWLConfig || !fouldWLConfig.length) {
            return null;
        }

        return { wlConfigPDA: fouldWLConfig[0].publicKey, account: fouldWLConfig[0].account, metadataPDA }
    } catch (ex) {
        // console.log("Error looking for WLConfig", ex);
        return null;
    }
}

const getEvolutionConfig = async () => {
    return {
        common: Number((await getRewardConfig(RARITY.COMMON, 0)).account.chromosCost.toString()),
        rare: Number((await getRewardConfig(RARITY.RARE, 0)).account.chromosCost.toString()),
        epic: Number((await getRewardConfig(RARITY.EPIC, 0)).account.chromosCost.toString()),
        legendary: Number((await getRewardConfig(RARITY.LEGENDARY, 0)).account.chromosCost.toString())
    }
}

module.exports = {
    getRewardConfig,
    getWLConfig,
    evolve,
    burnLegendary,
    getEvolutionConfig
}