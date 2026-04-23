# Changelog

## [0.2.0](https://github.com/tbhb/obsidian-shell/compare/0.1.0...0.2.0) (2026-04-23)


### Features

* add xterm.js terminal view ([b03912b](https://github.com/tbhb/obsidian-shell/commit/b03912bf004ca82e0364b8e8716399628d439540))
* focus the terminal on open and restart ([39ec095](https://github.com/tbhb/obsidian-shell/commit/39ec095852e1bf5d8b153429246d27ca83c37854))
* multi-session support with leaf-per-shell ([3bcbb50](https://github.com/tbhb/obsidian-shell/commit/3bcbb509450394ac853739ba618d68dd5e0a5d25))
* nested settings, theme integration, and WebGL rendering ([e4c3059](https://github.com/tbhb/obsidian-shell/commit/e4c30594522d4836e695dc81ce20a04892beb5f3))
* persist shell session across view close and reopen ([1d19a78](https://github.com/tbhb/obsidian-shell/commit/1d19a78093cdabda039993f030f69156ade09c06))
* scaffold obsidian-terminal plugin ([df5607c](https://github.com/tbhb/obsidian-shell/commit/df5607c9ccd1e0f5a238e4913fc223d26607eb93))
* shell picker for rescuing orphan sessions ([80e1261](https://github.com/tbhb/obsidian-shell/commit/80e12614095124cab109ad201f7a245e2d4ff7b1))
* shells sidebar view with reactive session list ([89d0431](https://github.com/tbhb/obsidian-shell/commit/89d0431906261079af2e2af9930bbc55d25f82d8))
* wire node-pty loader and a self-test command ([6d86c5a](https://github.com/tbhb/obsidian-shell/commit/6d86c5a21855a27e37f873c8dd7fd68c4ba537a6))


### Bug Fixes

* constrain terminal host to its leaf bounds ([b77d524](https://github.com/tbhb/obsidian-shell/commit/b77d524553d80123b2cba328aebc25a8efcb2fd4))
* discard the placeholder session when setState rebinds ([8e81714](https://github.com/tbhb/obsidian-shell/commit/8e817143f9a62c5a13fc4a5edb9c02682ea6b671))
* focus terminal on every user-initiated switch ([fd9744a](https://github.com/tbhb/obsidian-shell/commit/fd9744ac2e2b8f7919aaa8f7109a617aadcd3e99))
* measure Obsidian status bar height at runtime ([b4aa47f](https://github.com/tbhb/obsidian-shell/commit/b4aa47ffda4a4cfd795b5fae3a3c9143a2741ef4))
* only auto-open a shell on the very first enable ([84348ee](https://github.com/tbhb/obsidian-shell/commit/84348eefe9acef0147d64d08fe155915e59fe072))
* preserve sessionId across stateless setState calls ([c288200](https://github.com/tbhb/obsidian-shell/commit/c288200b200c196d4fdd2e5809c518760ce42341))
* re-fit xterm on container resize via ResizeObserver ([f3bd36a](https://github.com/tbhb/obsidian-shell/commit/f3bd36ab96e30241aebf282bbdcfe089b30dab8f))
* reserve space for the Obsidian status bar overlay ([a0ca8f6](https://github.com/tbhb/obsidian-shell/commit/a0ca8f6330572cc07dc361edcf29ab01354d22d2))
* seed sessionId from leaf state before bindSession ([f6f7b82](https://github.com/tbhb/obsidian-shell/commit/f6f7b8292d2b82450fa322215ad0c27c65e4e69a))
* shrink terminal host instead of padding it ([67924cf](https://github.com/tbhb/obsidian-shell/commit/67924cf0ee7c2ecdb386bd9426f2270f7eb4a36d))
* spawn the shell as a login shell ([394c655](https://github.com/tbhb/obsidian-shell/commit/394c6557113133cf11f5a4b1f9541aa550d76377))

## Changelog
