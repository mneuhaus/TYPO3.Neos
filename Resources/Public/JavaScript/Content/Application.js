/**
 * Main Ember.Application for the Content Module.
 *
 * Entry point which initializes the Content Module UI
 */

define(
[
	'Library/jquery-with-dependencies',
	'Library/underscore',
	'Shared/ResourceCache',
	'Shared/LocalStorage',
	'Shared/Configuration',
	'Shared/EventDispatcher',
	'Content/LoadingIndicator',
	'Content/Model/NodeSelection',
	'Content/Model/PublishableNodes',
	'Content/Model/NodeActions',
	'Content/EditPreviewPanel/EditPreviewPanelController',
	'vie/instance',
	'emberjs',
	'Content/InputEvents/KeyboardEvents',
	'create',
	'Library/vie',
	'Shared/Notification',
	'Shared/HttpClient'
],
function(
	$,
	_,
	ResourceCache,
	LocalStorage,
	Configuration,
	EventDispatcher,
	LoadingIndicator,
	NodeSelection,
	PublishableNodes,
	NodeActions,
	EditPreviewPanelController,
	vie,
	Ember,
	KeyboardEvents,
	CreateJS,
	VIE,
	Notification,
	HttpClient
) {
	var ContentModule = Ember.Application.extend(Ember.Evented, {
		rootElement: '#neos-application',
		router: null,

		/**
		 * The following setting is set to "true" when unfinished features should be shown.
		 *
		 * You can use it in the UI as following:
		 *
		 * Ember.View.extend({
		 *    template: Ember.Handlebars.compile('<span style="color:white">!!! Development mode !!!</span>'),
		 *    isVisibleBinding: 'ContentModule.showDevelopmentFeatures'
		 * })
		 *
		 * OR
		 *
		 * {{view T3.Content.UI.Button label="Inspect" isVisibleBinding="ContentModule.showDevelopmentFeatures"}}
		 *
		 * OR
		 * {{#boundIf ContentModule.showDevelopmentFeatures}}
		 *   Display only in development mode
		 * {{/boundif}}
		 */
		showDevelopmentFeatures: false,

		getCurrentUri: function() {
			return window.location.href;
		},

		_isLoadingPage : null,

		vie: null,

		_activeEntity: null,

		_vieOptions: {
			stanbolUrl: null,
			dbPediaUrl: null
		},

		$loader: null,
		spinner: null,

		bootstrap: function() {
			HttpClient.on('error', function(errorMessage) {
				Notification.error('Server communication error: ' + errorMessage);
				LoadingIndicator.stop();
			});

			this.set('vie', vie);
			if (window.T3.isContentModule) {
				this._initializeAjaxPageReload();
				this._initializeVie();
			}

			this._initializeDevelopmentFeatures();

			this._initializeNotifications();

			if (window.T3.isContentModule) {
				$('body').addClass('neos-backend');
				this._setPagePosition();
			}

			this._initializeDropdowns();

			if (window.T3.isContentModule) {
				this._initializeHistoryManagement();

				KeyboardEvents.initializeContentModuleEvents();
			}
		},

		_initializeNotifications: function() {
				// Initialize notifications
			$(this.rootElement).append('<div class="neos-notification-container"></div>');
				// TODO: Remove with resolving #45049
			$('body').midgardNotifications();
		},

		_initializeDevelopmentFeatures: function() {
			var that = this;
			window.addEventListener('hashchange', function() {
				that._enableDevelopmentFeaturesIfNeeded();
			}, false);
			this._enableDevelopmentFeaturesIfNeeded();
		},

		_initializeVie: function() {
			var that = this,
				schemaLoadErrorCallback = function() {
					console.warn('Error loading schemas.', arguments);
				};

			if (this.get('_vieOptions').stanbolUrl) {
				vie.use(new vie.StanbolService({
					proxyDisabled: true,
					url: this.get('_vieOptions').stanbolUrl
				}));
			}

			if (this.get('_vieOptions').dbPediaUrl) {
				vie.use(new vie.DBPediaService({
					proxyDisabled: true,
					url: this.get('_vieOptions').dbPediaUrl
				}));
			}

			ResourceCache.getItem(Configuration.get('VieSchemaUri')).then(
				function(vieSchema) {
					ResourceCache.getItem(Configuration.get('NodeTypeSchemaUri')).then(
						function(nodeTypeSchema) {
							VIE.Util.loadSchemaOrg(vie, vieSchema, null);
							Configuration.set('Schema', nodeTypeSchema);
							that._initializeVieAfterSchemaIsLoaded(vie);
						},
						schemaLoadErrorCallback
					);
				},
				schemaLoadErrorCallback
			);
		},

		_initializeVieAfterSchemaIsLoaded: function() {
			NodeSelection.initialize();
			PublishableNodes.initialize();
			this.trigger('pageLoaded');

			this._registerVieNodeTypeTemplateCallbacks();
			this._initializeCreateJs();
		},

		/**
		 * Register template generation callbacks.
		 *
		 * For adding new content elements VIE needs an HTML template. This method registers callback methods
		 * for generating those templates. The template itself is rendered on the server, and contains the
		 * rendered output of the requested node type, rendered within the current typoscript path.
		 *
		 * @return {void}
		 */
		_registerVieNodeTypeTemplateCallbacks: function() {
			var namespace = Configuration.get('TYPO3_NAMESPACE');
			_.each(vie.types.toArray(), function(type) {
				var nodeType = type.id.substring(1, type.id.length - 1).replace(namespace, '');
				var prefix = vie.namespaces.getPrefix(type.id);

				if (prefix === 'typo3') {
					vie.service('rdfa').setTemplate('typo3:' + nodeType, 'typo3:content-collection', function(entity, callBack, collectionView) {
							// This callback function is called whenever we create a content element
						var type = entity.get('@type'),
							nodeType = type.id.substring(1, type.id.length - 1).replace(namespace, ''),
							referenceEntity = null,
							lastMatchedEntity = null;

						var afterCreationCallback = function(nodePath, template) {
							entity.set('@subject', nodePath);

								// We also want to load all the other RDFa properties on the entity.
								// Else, editing newly created content elements in the Property Inspector
								// does not work.
							vie.load({element: template}).from('rdfa').execute();
							callBack(template);

							if (EditPreviewPanelController.get('currentlyActiveMode.isPreviewMode') !== true) {
									// When adding nested content elements (like the two-column-element),
									// we need to refresh CreateJS to render the content element handles
									// for the nested content collections.
								CreateJS.enableEdit();
							}
						};

						_.each(collectionView.collection.models, function(matchEntity) {
							if (entity === matchEntity && lastMatchedEntity) {
								referenceEntity = lastMatchedEntity;
								NodeActions.addBelow(
									nodeType,
									referenceEntity,
									afterCreationCallback
								);
							} else {
								lastMatchedEntity = matchEntity;
							}
						});

						if (referenceEntity === null) {
								// No reference entity found. This only happens when an element is created into a content collection
							if (collectionView.collection.models.length === 1) {
									// The content collection only contains the new entity and was empty before, so we create the node into the content collection
								NodeActions.addInside(
									nodeType,
									vie.entities.get($(collectionView.el).attr('about')),
									afterCreationCallback
								);
							} else {
									// The content collection contains other entities, so we create the node before the first entity (index 1 as index 0 is the newly created entity)
								NodeActions.addAbove(
									nodeType,
									collectionView.collection.models[1],
									afterCreationCallback
								);
							}
						}
					});
				}
			});
		},

		_initializeCreateJs: function() {
				// Midgard Storage
			$('body').midgardStorage({
				vie: vie,
				url: function () { /* empty function to prevent Midgard error */ },
				localStorage: true,
				autoSave: true
			});

			CreateJS.initialize();
		},

		_initializeDropdowns: function() {
			$('.dropdown-toggle', this.rootElement).dropdown();
		},

		_initializeHistoryManagement: function() {
			var that = this;
			if (window.history && _.isFunction(window.history.replaceState)) {
				window.history.replaceState({uri: window.location.href}, document.title, window.location.href);
			}
			window.addEventListener('popstate', function(event) {
				if (event.state && event.state.uri) {
					that.loadPage(event.state.uri, true);
				}
			});
		},

		_enableDevelopmentFeaturesIfNeeded: function() {
			if (window.location.hash === '#dev') {
				this.set('showDevelopmentFeatures', true);
				LocalStorage.setItem('showDevelopmentFeatures', true);
			} else if (window.location.hash === '#nodev') {
				this.set('showDevelopmentFeatures', false);
				LocalStorage.removeItem('showDevelopmentFeatures');
			} else if(LocalStorage.getItem('showDevelopmentFeatures')) {
				this.set('showDevelopmentFeatures', true);
			}
		},

		/**
		 * Intercept all links, and instead use AJAX for reloading the page.
		 */
		_initializeAjaxPageReload: function() {
			this._linkInterceptionHandler($('a:not(' + this.rootElement + ' a, .aloha-floatingmenu a)'));
			this._linkInterceptionHandler('a.neos-link-ajax', true);
		},

		_setPagePosition: function() {
			var hash = location.hash;
			if (hash.length > 0) {
				var contentElement = $('#' + hash.substring(1));
				if (contentElement.length > 0) {
					window.scroll(0, contentElement.position().top - $('body').offset().top);
				}
			}
		},

		reloadPage: function() {
			this.loadPage(this.getCurrentUri());
		},

		_linkInterceptionHandler: function(selector, constant) {
			var that = this;
			function clickHandler(e, link) {
				var $this = $(link),
					href = $this.attr('href'),
					protocolAndHost = location.protocol + '//' + location.host;
				// Check if the link is external by checking for a protocol
				if (href.match(/[a-z]*:\/\//) && href.substr(0, protocolAndHost.length) !== protocolAndHost) {
					return;
				}
				// Check if the link only points to a hash
				if (href[0] === '#') {
					return;
				}
				// Check if the link contains a hash and points to the current page
				if (href.indexOf('#') !== -1 && href.replace(protocolAndHost, '').split('#')[0] === location.pathname + location.search) {
					return;
				}
				// Check if the parent content element is selected if so don't trigger the link
				if ($this.parents('.neos-contentelement-active').length !== 0) {
					e.preventDefault();
					return;
				}
				// Check if the the link is inside a inline editable container and not in preview mode if so don't trigger the link
				if ($this.parents('.neos-inline-editable').length !== 0 && EditPreviewPanelController.get('currentlyActiveMode.isPreviewMode') !== true) {
					e.preventDefault();
					return;
				}
				e.preventDefault();
				that.loadPage($this.attr('href'));
			}
			if (constant === true) {
				$(document).on('click', selector, function(e) {
					clickHandler(e, this);
				});
			} else {
				$(selector).on('click', function(e) {
					clickHandler(e, this);
				});
			}
		},

		loadPage: function(uri, ignorePushToHistory) {
			var that = this;
			if (uri === '#') {
					// Often, pages use an URI of "#" to go to the homepage. In this case,
					// we extract the current workspace name and redirect to this workspace instead.
				var siteRoot = $('#neos-page-metainformation').attr('data-__siteroot');
				var workspaceName = siteRoot.substr(siteRoot.lastIndexOf('@') + 1);
				uri = '@' + workspaceName;
			}

			LoadingIndicator.start();
			this.set('_isLoadingPage', true);

			function pushUriToHistory() {
				if (window.history && !ignorePushToHistory && _.isFunction(window.history.pushState)) {
					window.history.pushState({uri: uri}, document.title, uri);
				}
			}

			var currentlyActiveContentElementNodePath = $('.neos-contentelement-active').attr('about');
			HttpClient.getResource(
				uri,
				{
					xhr: function() {
						var xhr = $.ajaxSettings.xhr();
						xhr.onreadystatechange = function() {
							if (xhr.readyState === 1) {
								LoadingIndicator.set(0.1, 200);
							}
							if (xhr.readyState === 2) {
								LoadingIndicator.set(0.9, 100);
							}
							if (xhr.readyState === 3) {
								LoadingIndicator.set(0.99, 50);
							}
						};
						return xhr;
					}
				}).then(
					function(htmlString) {
						var $htmlDom = $($.parseHTML(htmlString));

						var $pageMetadata = $htmlDom.filter('#neos-page-metainformation');
						if ($pageMetadata.length === 0) {
							Notification.error('Could not read page metadata from response. Please open the location ' + uri + ' outside the Neos backend.');
							that.set('_isLoadingPage', false);
							LoadingIndicator.stop();
							return;
						}

						pushUriToHistory();

						// Extract the HTML from the page, starting at (including) #neos-page-metainformation until #neos-application.
						var $newContent = $htmlDom.filter('#neos-page-metainformation').nextUntil('#neos-application').andSelf();

						// remove the current HTML content
						var $neosApplication = $('#neos-application');
						$neosApplication.prevAll().remove();
						$('body').prepend($newContent);
						that.set('_isLoadingPage', false);

						var $insertedContent = $neosApplication.prevAll();
						var $links = $insertedContent.find('a').add($insertedContent.filter('a'));
						that._linkInterceptionHandler($links);
						LoadingIndicator.done();

						$('title').html($htmlDom.filter('title').html());

						// TODO: transfer body classes

						that._setPagePosition();

						// Update node selection (will update VIE)
						NodeSelection.initialize();
						PublishableNodes.initialize();
						that.trigger('pageLoaded');

						// Send external event so site JS can act on it
						EventDispatcher.triggerExternalEvent('Neos.PageLoaded', 'Page is refreshed.');

						if (EditPreviewPanelController.get('currentlyActiveMode.isPreviewMode') !== true) {
							// Refresh CreateJS, renders the button bars f.e.
							CreateJS.enableEdit();
						}

						// If doing a reload, we highlight the currently active content element again
						var $currentlyActiveContentElement = $('[about="' + currentlyActiveContentElementNodePath + '"]');
						if ($currentlyActiveContentElement.length === 1) {
							NodeSelection.updateSelection($currentlyActiveContentElement);
						}
						that.set('_isLoadingPage', false);
						LoadingIndicator.done();
					},
					/**
					 * FALLBACK: AJAX error occurred,
					 * so we reload the whole backend.
					 */
					function() {
						window.location.href = uri;
					}
				);
		}

	}).create();
	ContentModule.deferReadiness();

	return ContentModule;
});
