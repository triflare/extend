<div align="center">

<img src="assets/icon.svg" width="75" alt="The Triflare Extend logo" style="padding-bottom: 20px;"/>

# Triflare Extend

Build, test, and ship extensions.

</div>

## Table of Contents

<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->

- [Highlights](#highlights)
- [Overview](#overview)
- [Usage](#usage)
- [Installation](#installation)
- [Feedback and Contributing](#feedback-and-contributing)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->

## Highlights

- **Use modules to build extensions:** With Triflare Extend, you can use JavaScript modules to build your TurboWarp extension, instead of keeping your entire codebase in one file.
- **For larger projects:** The larger your project gets, the harder it gets to maintain because it's all in one file. Triflare Extend builds your extension from multiple files instead.
- **Feature parity:** Triflare Extend has the same features as TurboWarp's vanilla extension system, including the development server.
- **Was it built with Extend?** Extensions built with Triflare Extend are almost identical to extensions that weren't.

## Overview

Large JavaScript projects are usually multiple files. TurboWarp extensions should be the same, but they aren't.

Triflare Extend is a zero-config custom TurboWarp extension build tool meant to solve the problem that large extensions get harder to build the larger they are. With Triflare Extend, you can use module syntax to build an extension, instead of coding one in one file.

## Usage

```bash
$ extend init

  • extend.yml
  • src/index.js
  • src/blocks/hello.js
✓ All set! Your new project is ready.

$ extend build

~ Getting My Extension ready...
✓ Done! Your extension is ready at dist/extension.js.

$ extend pack

~ Packing My Extension...
✓ Done! Your project is ready to share at dist/my-extension.zip.
```

## Installation

**Requirements:**

- At least Node.js v24.

To use `extend` raw instead of `npx @triflare/extend`, install Triflare Extend globally:

```bash
npm i -g @triflare/extend
```

## Feedback and Contributing

If you've found a bug, or you want a new feature, please [open an issue](https://github.com/triflare/extend/issues). If you'd rather implement it yourself, make your changes and [open a pull request](https://github.com/triflare/extend/pulls).

Thank you for improving Triflare Extend! It's people like you who make open-source projects like these thrive.
