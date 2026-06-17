import type { StorybookConfig } from '@storybook/react-vite'
import tailwindcss from '@tailwindcss/vite'

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(ts|tsx)'],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  viteFinal(config) {
    config.plugins = config.plugins || []
    config.plugins.push(tailwindcss())
    config.build = { ...config.build, target: 'esnext' }
    config.optimizeDeps = {
      ...config.optimizeDeps,
      esbuildOptions: { ...config.optimizeDeps?.esbuildOptions, target: 'esnext' },
    }

    return config
  },
}

export default config
