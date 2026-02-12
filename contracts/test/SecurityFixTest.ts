
import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";

describe("Security Fix: FlashLoanExecutor Payload Exploit", function () {
    async function deployFixture() {
        const [deployer, attacker, user, treasury] = await ethers.getSigners();

        // Deploy Mocks
        const MockERC20 = await ethers.getContractFactory("MockERC20");
        const token = await MockERC20.deploy("Test Token", "TEST", 18);
        // const weth = await MockERC20.deploy("WETH", "WETH", 18);

        // Deploy Protocol
        const RiskManager = await ethers.getContractFactory("RiskManager");
        const riskManager = await RiskManager.deploy(deployer.address, ethers.parseUnits("100", "gwei"), true);

        const ArbitrageRouter = await ethers.getContractFactory("ArbitrageRouter");
        const router = await ArbitrageRouter.deploy(deployer.address, treasury.address);

        const FlashLoanExecutor = await ethers.getContractFactory("FlashLoanExecutor");
        // Passing Zero Address for Aave Pool to enable UniV3 fallback path logic
        const executor = await FlashLoanExecutor.deploy(
            deployer.address,
            ethers.ZeroAddress, // No Aave Pool
            await router.getAddress(),
            treasury.address,
            await riskManager.getAddress()
        );

        // Grant RELAYER_ROLE to deployer for setup if needed (though exploit is unrestricted)
        const RELAYER_ROLE = await executor.RELAYER_ROLE();
        await executor.grantRole(RELAYER_ROLE, deployer.address);

        // Enable asset in RiskManager
        await riskManager.setAssetConfig(
            await token.getAddress(),
            true,
            ethers.parseEther("1000000"), // maxFlashLoan
            0, // minProfit
            ethers.parseEther("1") // maxRefund
        );

        return { executor, riskManager, token, attacker, deployer };
    }

    it("Should revert when an unauthorized address calls uniswapV3FlashCallback", async function () {
        const { executor, token, attacker } = await loadFixture(deployFixture);
        const executorAddress = await executor.getAddress();
        const tokenAddress = await token.getAddress();

        // Prepare malicious payload
        // We construct a valid-looking params struct but lying about who the pool is
        const params = {
            steps: [],
            profitToken: tokenAddress,
            minNetProfit: 0,
            user: attacker.address, // send "profit" to attacker
            deadline: 9999999999,
            refundRecipient: attacker.address,
            maxGasRefund: 0,
            flashPool: attacker.address, // <--- The lie: "I am the pool"
            amount: ethers.parseEther("100"),
            isToken0: true
        };

        const encodedParams = ethers.AbiCoder.defaultAbiCoder().encode(
            [
                "tuple(tuple(address adapter, address tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut, bytes data)[] steps, address profitToken, uint256 minNetProfit, address user, uint256 deadline, address refundRecipient, uint256 maxGasRefund, address flashPool, uint256 amount, bool isToken0)"
            ],
            [params]
        );

        // Attacker calls the callback directly.
        // In the vulnerable version, this checks msg.sender == params.flashPool. 
        // Since attackers sends it and sets flashPool = attacker, it passes.
        // In the fixed version, it should check riskManager.uniV3FlashPoolAllowed(msg.sender).

        // Attempt exploit
        await expect(
            executor.connect(attacker).uniswapV3FlashCallback(0, 0, encodedParams)
        ).to.be.revertedWith("Executor: unauthorized flash pool");
    });
});
