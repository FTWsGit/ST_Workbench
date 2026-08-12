export default {
  plugins: ['stylelint-declaration-strict-value'],
  rules: {
    'scale-unlimited/declaration-strict-value': [
      ['color', 'background-color', 'border-color', 'border-radius', 'font-size', 'font-family', 'font-weight' ],
      {
        ignoreValues: ['transparent', 'inherit', 'currentColor', 'none', '0'],
      },
    ],
  },
}
