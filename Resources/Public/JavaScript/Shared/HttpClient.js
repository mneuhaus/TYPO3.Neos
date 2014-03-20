define(
	[
		'emberjs',
		'Library/jquery-with-dependencies',
		'Shared/Configuration'
	],
	function(Ember, $, Configuration) {
		return Ember.Object.createWithMixins(Ember.Evented, {
			_failedRequest: null,
			_lastSuccessfulTransfer: null,
			_endpoints: {},

			_getEndpointUrl: function(endpoint) {
				if (!this._endpoints[endpoint]) {
					this._endpoints[endpoint] = $('link[rel="' + endpoint + '"]').attr('href');
				}
				return this._endpoints[endpoint];
			},

			getResource: function(url, optionsOverride) {
				return this._request(url, 'GET', optionsOverride);
			},

			updateResource: function(url, optionsOverride) {
				return this._request(url, 'PUT', optionsOverride);
			},

			createResource: function(url, optionsOverride) {
				return this._request(url, 'POST', optionsOverride);
			},

			deleteResource: function(url, optionsOverride) {
				// TODO: make DELETE method with the full REST implementation
				// For now we can not use DELETE and also pass arguments using the request body,
				// and client side we don\t have a UrlTemplates implementation yet
				return this._request(url, 'POST', optionsOverride);
			},

			_request: function(url, requestMethod, optionsOverride) {
				var that = this,
					promise = Ember.Deferred.create({
						_currentRequest: null,

						abort: function() {
							if (this.get('_currentRequest')) {
								this.get('_currentRequest').abort();
								this.set('_currentRequest', null);
							}
						}
					}),
					options = {
						type: requestMethod,
						url: url,
						data: {}
					};

				if (optionsOverride) {
					$.extend(options, optionsOverride);
				}

				if (requestMethod !== 'GET' && requestMethod !== 'HEAD') {
					options.data.__csrfToken = Configuration.get('CsrfToken');
				}

				if (window.localStorage.showDevelopmentFeatures) {
					console.log('HttpClient', requestMethod, url, options);
				}

				promise.set(
					'_currentRequest',
					$.ajax(options).done(function() {
						if (requestMethod === 'POST' || requestMethod === 'PUT') {
							that.set('_lastSuccessfulTransfer', new Date());
						}
						that.set('_failedRequest', false);

						promise.resolve.apply(promise, arguments);
					}).fail(function(jqXHR, textStatus, errorThrown) {
						that.set('_failedRequest', true);
						if (window.localStorage.showDevelopmentFeatures) {
							that.trigger('error', ['requestMethod: ' + requestMethod, 'url: ' + url, 'data: ' + JSON.stringify(options)].join(' '));
						} else {
							that.trigger('error', textStatus + ' ' + errorThrown);
						}
						promise.reject.apply(promise, arguments);
					})
				);

				return promise;
			}

		});

	}
);