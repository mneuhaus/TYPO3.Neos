/**
 * PublishableNodes
 *
 * Contains the currently publishable (proxy) nodes.
 */
define(
[
	'emberjs',
	'Library/jquery-with-dependencies',
	'vie/instance',
	'vie/entity',
	'Shared/EventDispatcher',
	'Shared/NodeTypeService',
	'Shared/Notification',
	'Shared/Endpoint/WorkspaceEndpoint',
	'Shared/Endpoint/NodeEndpoint'
], function(
	Ember,
	$,
	vie,
	EntityWrapper,
	EventDispatcher,
	NodeTypeService,
	Notification,
	WorkspaceEndpoint,
	NodeEndpoint
) {
	return Ember.Object.extend({
		publishableEntitySubjects: [],

		workspaceWidePublishableEntitySubjects: [],

		noChanges: function() {
			return this.get('publishableEntitySubjects').length === 0;
		}.property('publishableEntitySubjects.length'),

		numberOfPublishableNodes: function() {
			return this.get('publishableEntitySubjects').length;
		}.property('publishableEntitySubjects.length'),

		noWorkspaceWideChanges: function() {
			return this.get('workspaceWidePublishableEntitySubjects').length === 0;
		}.property('workspaceWidePublishableEntitySubjects.length'),

		numberOfWorkspaceWidePublishableNodes: function() {
			return this.get('workspaceWidePublishableEntitySubjects').length;
		}.property('workspaceWidePublishableEntitySubjects.length'),

		initialize: function() {
			vie.entities.on('change', this._updatePublishableEntities, this);
			this._updatePublishableEntities();

			var that = this;
			EventDispatcher.on('nodeDeleted', function(parentNode) {
				that.getWorkspaceWideUnpublishedNodes();
			});

			EventDispatcher.on('nodeMoved', function(node) {
				that.getWorkspaceWideUnpublishedNodes();
			});
		},

		_updatePublishableEntities: function() {
			var publishableEntitySubjects = [];
			var pageNodeContextPath = $('#neos-page-metainformation').attr('about'),
				pageNodePath = pageNodeContextPath.substr(0, pageNodeContextPath.lastIndexOf('@'));

			vie.entities.forEach(function(entity) {
				if (this._isEntityPublishable(entity)) {
					var nodePath = entity.id.substr(1, entity.id.lastIndexOf('@') - 1);

					if (!this.get('workspaceWidePublishableEntitySubjects').findBy('nodePath', nodePath)) {
						this.get('workspaceWidePublishableEntitySubjects').addObject({
							nodePath: nodePath,
							pageNodePath: pageNodePath
						});
					}
					publishableEntitySubjects.push(entity.id);
				}
			}, this);

			this.set('publishableEntitySubjects', publishableEntitySubjects);
		},

		/**
		 * Check whether the entity is publishable or not. Currently, everything
		 * which is not in the live workspace is publishable.
		 */
		_isEntityPublishable: function(entity) {
			var attributes = EntityWrapper.extractAttributesFromVieEntity(entity);
			return attributes.__workspacename !== 'live';
		},

		/**
		 * Publish all blocks which are unsaved *and* on current page.
		 */
		publishChanges: function(autoPublish) {
			var that = this,
				transformFn = function(subject) {
					var entity = vie.entities.get(subject);
					return [entity.fromReference(subject), 'live'];
				},
				numberOfUnsavedRecords = this.get('publishableEntitySubjects').get('length');

			this.get('publishableEntitySubjects').forEach(function(element) {
				// Force copy of array
				var args = transformFn(element).slice();
				NodeEndpoint.set('_saveRunning', true);

				NodeEndpoint.update(args[0]).then(
					function() {
						that._removeNodeFromPublishableEntitySubjects(element, 'live');
						numberOfUnsavedRecords--;
						if (numberOfUnsavedRecords <= 0) {
							NodeEndpoint.set('_saveRunning', false);

							if (autoPublish != true) {
								var nodeTypeSchema = NodeTypeService.getCurrentNodeTypeSchema(),
									title = $('#neos-page-metainformation').attr('data-neos-title')
								Notification.ok('Published changes for ' + nodeTypeSchema.ui.label + ' "' + title + '".');
							}
						}
					}
				);
			});
		},

		_removeNodeFromPublishableEntitySubjects: function(subject, workspaceOverride) {
			var that = this,
				entity = vie.entities.get(subject);
			if (workspaceOverride) {
				entity.set('typo3:__workspacename', workspaceOverride);
			}

			var nodePath = entity.id.substr(1, entity.id.lastIndexOf('@') - 1),
				node = that.get('workspaceWidePublishableEntitySubjects').findBy('nodePath', nodePath);
			if (node) {
				that.get('workspaceWidePublishableEntitySubjects').removeObject(node);
			}
		},

		/**
		 * Discard all blocks which are unsaved *and* on current page.
		 */
		discardChanges: function() {
			var that = this,
				transformFn = function(subject) {
					var entity = vie.entities.get(subject);
					return [entity.fromReference(subject)];
				},
				numberOfUnsavedRecords = this.get('publishableEntitySubjects').get('length');

			this.get('publishableEntitySubjects').forEach(function(element) {
				// Force copy of array
				var args = transformFn(element).slice();
				NodeEndpoint.set('_saveRunning', true);

				NodeEndpoint.discardNode(args[0]).then(
					function() {
						that._removeNodeFromPublishableEntitySubjects(element);
						numberOfUnsavedRecords--;
						if (numberOfUnsavedRecords <= 0) {
							NodeEndpoint.set('_saveRunning', false);

							require(
								{context: 'neos'},
								[
									'Content/Application'
								],
								function(ContentModule) {
									ContentModule.reloadPage();
									ContentModule.one('pageLoaded', function() {
										Ember.run.next(function() {
											EventDispatcher.trigger('nodesInvalidated');
											EventDispatcher.trigger('contentChanged');
										});
									});
								}
							);
							var nodeTypeSchema = NodeTypeService.getCurrentNodeTypeSchema(),
								title = $('#neos-page-metainformation').attr('data-neos-title');
							Notification.ok('Discarded changes for ' + nodeTypeSchema.ui.label + ' "' + title + '".');
						}
					}
				);
			});
		},

		/**
		 * Publishes everything inside the current workspace.
		 */
		publishAll: function() {
			var siteRoot = $('#neos-page-metainformation').attr('data-__siteroot'),
				workspaceName = siteRoot.substr(siteRoot.lastIndexOf('@') + 1),
				publishableEntities = this.get('publishableEntitySubjects'),
				that = this;

			WorkspaceEndpoint.publishAll(workspaceName).then(
				function() {
					$.each(publishableEntities, function(index, element) {
						vie.entities.get(element).set('typo3:__workspacename', 'live');
					});

					that.getWorkspaceWideUnpublishedNodes();
					Notification.ok('Published all changes.');
				},
				function() {
					Notification.error('Unexpected error while publishing all changes: ' + JSON.stringify(result));
				}
			);
		},

		/**
		 * Discards everything inside the current workspace.
		 */
		discardAll: function() {
			var siteRoot = $('#neos-page-metainformation').attr('data-__siteroot'),
				workspaceName = siteRoot.substr(siteRoot.lastIndexOf('@') + 1),
				that = this;
			WorkspaceEndpoint.discardAll(workspaceName).then(
				function() {
					require(
						{context: 'neos'},
						[
							'Content/Application'
						],
						function(ContentModule) {
							ContentModule.reloadPage();
							ContentModule.one('pageLoaded', function() {
								Ember.run.next(function() {
									EventDispatcher.trigger('nodesInvalidated');
									EventDispatcher.trigger('contentChanged');
								});
							});
						}
					);
					that.getWorkspaceWideUnpublishedNodes();
					Notification.ok('Discarded all changes.');
				},
				function() {
					Notification.error('Unexpected error while discarding all changes: ' + JSON.stringify(result));
				}
			);
		},

		/**
		 * Get all unpublished nodes inside the current workspace.
		 */
		getWorkspaceWideUnpublishedNodes: function() {
			var siteRoot = $('#neos-page-metainformation').attr('data-__siteroot'),
				workspaceName = siteRoot.substr(siteRoot.lastIndexOf('@') + 1),
				that = this;

			WorkspaceEndpoint.getWorkspaceWideUnpublishedNodes(workspaceName).then(
				function(result) {
					that.set('workspaceWidePublishableEntitySubjects', result.data);
				}
			);
		}

	}).create();
});