/**
 * ElectronのpreloadプロセスとMainWorldプロセスの橋渡し。
 */

import {
  type TransferableResult,
  getOrThrowTransferableResult,
} from "../transferableResultHelper";
import { SandboxKey, type Sandbox } from "@/type/preload";
import { translateSystemDialogArgumentsWithRuntime } from "./systemDialogI18n";

export const BridgeKey = "electronBridge";

export type SandboxWithTransferableResult = {
  [K in keyof Sandbox]: (
    ...args: Parameters<Sandbox[K]>
  ) => ReturnType<Sandbox[K]> extends Promise<infer R>
    ? Promise<TransferableResult<R>>
    : TransferableResult<ReturnType<Sandbox[K]>>;
};

// Apply system-UI translation at the renderer boundary so existing business
// code can keep calling the Electron-backed Sandbox API unchanged.
const unwrapApi = (baseApi: SandboxWithTransferableResult): Sandbox =>
  new Proxy<Sandbox>({} as Sandbox, {
    get(_target, prop: keyof SandboxWithTransferableResult) {
      const value = baseApi[prop];
      if (typeof value !== "function") {
        return value;
      }

      // 元の関数を呼び出し、getOrThrowTransferableResultで中の値を取り出す。
      // Promiseが帰ってきた場合はthenの中で取り出す。
      return (
        ...args: Parameters<SandboxWithTransferableResult[typeof prop]>
      ) => {
        const translatedArgs = translateSystemDialogArgumentsWithRuntime(
          prop,
          args,
        );
        const result: ReturnType<SandboxWithTransferableResult[typeof prop]> =
          // @ts-expect-error 動いているので無視
          value(...translatedArgs);

        if (result instanceof Promise) {
          // @ts-expect-error 動いているので無視
          return result.then((res) => getOrThrowTransferableResult(res));
        } else {
          return getOrThrowTransferableResult(result);
        }
      };
    },
  });

// @ts-expect-error readonlyになっているが、初期化処理はここで行うので問題ない
window[SandboxKey] = unwrapApi(
  (
    window as unknown as {
      [BridgeKey]: SandboxWithTransferableResult;
    }
  )[BridgeKey],
);
