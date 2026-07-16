module.exports = {
  transform: {
    "^.+\\.jsx?$": "babel-jest"
  },
  transformIgnorePatterns: [
    "/node_modules/(?!react-leaflet|@react-leaflet|leaflet)/"
  ],
  moduleNameMapper: {
    "\\.(css|less)$": "identity-obj-proxy"
  },
  testEnvironment: "jsdom"
};
