/**Reads the real XRPL testnet and Solana devnet, independently of the server.

The live checks use this to confirm what the server claims: that a payment is
really on the ledger, that a stamp really exists, and how much money moved.
Everything here only reads, except tryTransfer, which attempts a transfer that
is expected to be rejected.
*/

import { createSignerFromKeypair, Keypair } from '@metaplex-foundation/umi';
import { fetchAsset, fetchCollection, transfer } from '@metaplex-foundation/mpl-core';
import { Client } from 'xrpl';
import { getPaidToday } from '../../../src/xrpl';
import { disconnectClient, getClient, readAssetBalance } from '../../../src/xrpl/client';
import { loadXrplConfig, XrplConfig } from '../../../src/xrpl/config';
import { getSolanaClient, loadKeypairFile } from '../../../src/solana/client';
import { realStampService } from '../../../src/solana/stamps';
import { Stamp } from '../../../src/solana/types';

export interface LedgerPayment {
  found: boolean;
  validated?: boolean;
  result?: string;
  from?: string;
  to?: string;
  amount?: string;
  currency?: string;
  issuer?: string;
  memos?: string[];
}

function unhex(hex: string): string {
  return Buffer.from(hex, 'hex').toString('utf8');
}

export class Chains {
  private client!: Client;
  private config!: XrplConfig;

  /** Connect to the XRPL testnet. Solana connects on first use. */
  async init(): Promise<void> {
    this.config = loadXrplConfig();
    this.client = await getClient(this.config);
  }

  async close(): Promise<void> {
    await disconnectClient();
  }

  get issuer(): string {
    return this.config.rlusdIssuer;
  }

  /** RLUSD balance of an XRPL address, read from the ledger. */
  async rlusd(address: string): Promise<number> {
    return readAssetBalance(this.client, this.config, address);
  }

  /** RLUSD the agent paid to an address since 00:00 UTC, read from the ledger. */
  async paidToday(address: string): Promise<number> {
    return getPaidToday(address);
  }

  /** XRP balance, for the report. */
  async xrp(address: string): Promise<number> {
    return Number(await this.client.getXrpBalance(address));
  }

  /** Look up a payment on the ledger and return what it says.

  Args:
      hash (string): Transaction hash.

  Returns:
      Promise<LedgerPayment>: What the ledger recorded, retrying briefly if the
          transaction is not visible yet.
  */
  async payment(hash: string): Promise<LedgerPayment> {
    for (let attempt = 0; attempt < 8; attempt++) {
      try {
        const response = await this.client.request({ command: 'tx', transaction: hash });
        const result = response.result as unknown as Record<string, any>;
        const body = result.tx_json ?? result;
        const amount = body.Amount ?? body.DeliverMax;
        return {
          found: true,
          validated: Boolean(result.validated),
          result: result.meta?.TransactionResult,
          from: body.Account,
          to: body.Destination,
          amount: typeof amount === 'object' ? amount.value : String(amount),
          currency: typeof amount === 'object' ? amount.currency : 'XRP',
          issuer: typeof amount === 'object' ? amount.issuer : undefined,
          memos: (body.Memos ?? []).map(
            (m: any) => `${unhex(m.Memo.MemoType ?? '')}=${unhex(m.Memo.MemoData ?? '')}`
          ),
        };
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
    }
    return { found: false };
  }

  /** The RLUSD trust line an account holds with the issuer.

  Args:
      address (string): XRPL address.

  Returns:
      Promise<{ limit: string; balance: string } | null>: The line, or null if none.
  */
  async trustLine(address: string): Promise<{ limit: string; balance: string } | null> {
    const lines = await this.client.request({
      command: 'account_lines',
      account: address,
      peer: this.config.rlusdIssuer,
    });
    const line = lines.result.lines.find((l) => l.currency === this.config.rlusdCurrency);
    return line ? { limit: line.limit, balance: line.balance } : null;
  }

  /** Stamps a Solana wallet holds, read from devnet. */
  async stamps(owner: string): Promise<Stamp[]> {
    return realStampService.getStamps(owner);
  }

  /** The Solana public address of a saved keypair.

  Args:
      name (string): Keypair name such as demo-1.

  Returns:
      string: The base58 public address.
  */
  solanaAddress(name: string): string {
    const umi = getSolanaClient();
    return loadKeypairFile(umi, `.keys/${name}.json`).publicKey.toString();
  }

  /** Make a brand new Solana wallet. Its secret key exists only in memory and is never saved.

  Returns:
      { address: string; keypair: Keypair }: The public address and the in-memory key.
  */
  newSolanaWallet(): { address: string; keypair: Keypair } {
    const keypair = getSolanaClient().eddsa.generateKeypair();
    return { address: keypair.publicKey.toString(), keypair };
  }

  /** SOL balance of the issuer wallet, which pays mint fees. */
  async issuerSol(): Promise<number> {
    const umi = getSolanaClient();
    const balance = await umi.rpc.getBalance(umi.identity.publicKey);
    return Number(balance.basisPoints) / 1e9;
  }

  /** Try to move a stamp from its owner to another wallet, expecting it to be refused.

  Args:
      assetAddress (string): The stamp's asset address.
      owner (Keypair): The stamp owner's key, held in memory.
      newOwnerKey (string): Keypair name of the saved wallet to send it to.

  Returns:
      Promise<{ rejected: boolean; error: string; ownerAfter: string; ownerBefore: string }>:
          Whether the network refused it, the reason, and who owns it afterward.
  */
  async tryTransfer(
    assetAddress: string,
    owner: Keypair,
    newOwnerKey: string
  ): Promise<{ rejected: boolean; error: string; ownerAfter: string; ownerBefore: string }> {
    const umi = getSolanaClient();
    const ownerSigner = createSignerFromKeypair(umi, owner);
    const newOwner = loadKeypairFile(umi, `.keys/${newOwnerKey}.json`).publicKey;

    const asset = await fetchAsset(umi, assetAddress);
    const collection =
      asset.updateAuthority.type === 'Collection' && asset.updateAuthority.address
        ? await fetchCollection(umi, asset.updateAuthority.address)
        : undefined;
    const ownerBefore = asset.owner.toString();

    let error = '';
    try {
      await transfer(umi, { asset, collection, newOwner, authority: ownerSigner }).sendAndConfirm(umi);
    } catch (caught) {
      error = (caught as Error).message.split('\n')[0];
    }
    const ownerAfter = (await fetchAsset(umi, assetAddress)).owner.toString();
    return { rejected: error !== '' && ownerAfter === ownerBefore, error, ownerAfter, ownerBefore };
  }
}
