import { FlatCompat } from "@eslint/eslintrc";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({ baseDirectory: currentDirectory });

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript", "plugin:jsx-a11y/recommended"),
  {
    rules: {
      // MadoiSelect(components/ui-client.tsx)は独自のcombobox実装で、fieldLabel/ariaLabelを
      // 自前のaria-labelとして持つため、label要素をネイティブcontrolとして検出できなくても問題ない。
      "jsx-a11y/label-has-associated-control": ["error", { controlComponents: ["MadoiSelect"], depth: 4 }]
    }
  },
  {
    ignores: [".next/**", ".worktrees/**", ".claude/**", "node_modules/**", "out/**", "build/**", "coverage/**", "next-env.d.ts"]
  }
];

export default eslintConfig;
