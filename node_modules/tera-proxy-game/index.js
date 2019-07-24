module.exports = {
	ModManager: require('./mod-manager'),
	Dispatch: require('./connection/dispatch'),
	Connection: require('./connection'),
	FakeClient: require('./clients/FakeClient'),
	RealClient: require('./clients/RealClient')
}