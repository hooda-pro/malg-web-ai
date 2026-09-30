# UI fixes (v11)

- globals.css: removed `border-radius: 8px` from global `:focus-visible` (made focused elements lose their rounding); inputs/textarea no longer show the browser focus frame; autofill no longer paints a white/blue box; native search "x" hidden.
- tailwind.config.ts: `future.hoverOnlyWhenSupported` — hover styles no longer stick on touch screens.
- WelcomeHero: suggestion prompts are now separate rounded cards (hover keeps the same shape).
- ProjectFilesCard / ActivityBlock: hover rows are rounded and inset instead of square cells inside a rounded panel.
- TopBar: token ring 20px -> 13px; model/token popovers fit phone width (inset-x-3 on mobile).
- BottomInputBar: long keyboard hint hidden on phones.
