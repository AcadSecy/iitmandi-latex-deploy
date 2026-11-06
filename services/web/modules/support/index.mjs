import SupportRouter from './app/src/SupportRouter.mjs'

/** @import { WebModule } from "../../types/web-module" */

// Named "support" because upstream shows "Contact us" in the editor's Help
// menus only when a module of that name is loaded (Features.mjs). Ours fills
// the contactUsModal slot with the "Report a problem" dialog.

/** @type {WebModule} */
const SupportModule = {
  router: SupportRouter,
}

export default SupportModule
