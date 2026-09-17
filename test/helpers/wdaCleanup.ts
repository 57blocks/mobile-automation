/**
 * Clears WebDriverAgent build processes orphaned by a cancelled run.
 *
 * Ctrl+C makes `@wdio/appium-service` kill the Appium server, but not the
 * `xcodebuild ... WebDriverAgentRunner` it spawned; that survives, is reparented to launchd
 * (PPID 1), and keeps the device's only XCTest session. The next run then fails session
 * creation with `XCTDaemonErrorDomain Code=41` in well under a second — a daemon refusal,
 * not a signing or tunnel problem.
 *
 * Only PPID 1 processes are killed, so a concurrent run on another device is left alone.
 *
 * @returns {Promise<number[]>} PIDs that were killed
 */
export async function killOrphanedWdaBuilds(): Promise<number[]> {
    const { execFileSync } = await import('node:child_process');

    let ps: string;
    try {
        ps = execFileSync('ps', ['-Ao', 'pid=,ppid=,command='], { encoding: 'utf8' });
    } catch {
        // No process list available — never let cleanup block the run it is protecting.
        return [];
    }

    const orphans = ps
        .split('\n')
        .map((line) => line.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/))
        // A type predicate, not .filter(Boolean): that does not narrow away the null.
        .filter((match): match is RegExpMatchArray => match !== null)
        .filter(([, , ppid, command]) => ppid === '1'
            && /\bxcodebuild\b/.test(command)
            && /WebDriverAgent/.test(command))
        .map(([, pid]) => Number(pid));

    if (!orphans.length) return [];

    console.log(`[WDA] Found ${orphans.length} orphaned WebDriverAgent build process(es) from a cancelled run: ${orphans.join(', ')}`);

    const alive = (pid: number): boolean => {
        try {
            process.kill(pid, 0);
            return true;
        } catch {
            return false;
        }
    };

    const signal = (pid: number, sig: NodeJS.Signals): void => {
        try {
            process.kill(pid, sig);
        } catch {
            // Already gone, or not ours — the alive() check below is the source of truth.
        }
    };

    // SIGTERM first so xcodebuild can tear down its device connection.
    orphans.forEach((pid) => signal(pid, 'SIGTERM'));
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const stubborn = orphans.filter(alive);
    if (stubborn.length) {
        stubborn.forEach((pid) => signal(pid, 'SIGKILL'));
        await new Promise((resolve) => setTimeout(resolve, 500));
    }

    const survivors = orphans.filter(alive);
    if (survivors.length) {
        console.warn(`⚠  [WDA] Could not kill PID(s) ${survivors.join(', ')} — session creation may still fail with XCTDaemonErrorDomain Code=41.`);
    } else {
        console.log('[WDA] Orphaned WebDriverAgent build process(es) cleared.');
    }

    return orphans.filter((pid) => !alive(pid));
}
