import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { network } from "hardhat";

describe("HackathonVotingV3", async function () {
    const { viem } = await network.connect();
    const publicClient = await viem.getPublicClient();
    const [, creator, mentor] = await viem.getWalletClients();

    it("lets the owner clear a voter's `voted` flag by registering them again", async function () {
        // `registerVoter` sobrescreve a struct inteira, inclusive `voted: false`.
        // O dono consegue, então, devolver o direito de voto a quem já votou —
        // e o voto anterior continua contado. Este teste documenta o
        // comportamento atual; ele deve virar `assert.rejects` quando a
        // reinscrição passar a ser recusada.
        const contract = await viem.deployContract("HackathonVotingV3");

        await contract.write.createHackathon();
        await contract.write.addProject([1n, "Projeto", creator.account.address]);
        await contract.write.registerVoter([1n, mentor.account.address, 2]);
        await contract.write.openVoting([1n]);

        const mentorContract = await viem.getContractAt("HackathonVotingV3", contract.address, {
            client: { public: publicClient, wallet: mentor },
        });

        await mentorContract.write.vote([1n, 1n]);
        const [, afterFirst] = await contract.read.getAllProjects([1n]);
        assert.equal(afterFirst[0], 3n);

        await assert.rejects(mentorContract.write.vote([1n, 1n]), /Already voted/);

        // Reinscrever zera o `voted` e o mesmo endereço vota de novo.
        await contract.write.registerVoter([1n, mentor.account.address, 2]);
        await mentorContract.write.vote([1n, 1n]);

        const [, afterSecond] = await contract.read.getAllProjects([1n]);
        assert.equal(
            afterSecond[0],
            6n,
            "o mesmo eleitor somou peso duas vezes no mesmo projeto",
        );
    });

    it("prevents a project creator from voting on their own project", async function () {
        const contract = await viem.deployContract("HackathonVotingV3");

        await contract.write.createHackathon();
        await contract.write.addProject([1n, "Projeto V3", creator.account.address]);
        await contract.write.registerVoter([1n, creator.account.address, 1]);
        await contract.write.registerVoter([1n, mentor.account.address, 2]);
        await contract.write.openVoting([1n]);

        const creatorContract = await viem.getContractAt("HackathonVotingV3", contract.address, {
            client: {
                public: publicClient,
                wallet: creator,
            },
        });

        const mentorContract = await viem.getContractAt("HackathonVotingV3", contract.address, {
            client: {
                public: publicClient,
                wallet: mentor,
            },
        });

        await assert.rejects(
            creatorContract.write.vote([1n, 1n]),
            /Project creator cannot self-vote/,
        );

        await mentorContract.write.vote([1n, 1n]);

        const [, votes] = await contract.read.getAllProjects([1n]);
        assert.equal(votes[0], 3n);
    });
});
