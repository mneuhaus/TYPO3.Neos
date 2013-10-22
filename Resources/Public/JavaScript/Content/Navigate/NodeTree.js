/**
 * Node tree
 */
define(
	[
		'emberjs',
		'Library/jquery-with-dependencies',
		'./AbstractNodeTree',
		'../Application',
		'Shared/Configuration',
		'Shared/ResourceCache',
		'Shared/Notification',
		'vie/instance',
		'../Model/NodeSelection',
		'./NavigatePanelController',
		'../Inspector/InspectorController',
		'text!./NodeTree.html'
	], function(
		Ember,
		$,
		AbstractNodeTree,
		ContentModule,
		Configuration,
		ResourceCache,
		Notification,
		vieInstance,
		NodeSelection,
		NavigatePanelController,
		InspectorController,
		template
	) {
		var pageMetaInformation = $('#neos-page-metainformation');

		return AbstractNodeTree.extend({
			elementId: ['neos-node-tree'],
			classNameBindings: ['filtering:neos-node-tree-filtering'],
			template: Ember.Handlebars.compile(template),
			treeSelector: '#neos-node-tree-tree',

			controller: NavigatePanelController,

			editNodeTitleMode: false,
			searchTerm: '',
			nodeType: '',
			filtering: false,
			latestFilterQuery: null,

			searchTermIsEmpty: function() {
				return this.get('searchTerm') === '';
			}.property('searchTerm'),

			clearSearchTerm: function() {
				var searchIsEmpty = this.get('searchTermIsEmpty');
				this.set('searchTerm', '');
				if (!searchIsEmpty) {
					this.filterTree();
				}
			},

			searchField: Ember.TextField.extend({
				_delay: 300,
				_value: '',
				_timeout: null,

				keyUp: function() {
					var that = this,
						value = this.get('value');
					if (this.get('_timeout') !== null) {
						clearTimeout(this.get('_timeout'));
					}
					this.set('_timeout', setTimeout(function() {
						if (value !== that.get('_value')) {
							that.set('_value', value);
							that.get('parentView').filterTree();
						}
					}, this._delay));
				}
			}),

			didInsertElement: function() {
				this._super();

				var that = this,
					$neosNodeTypeSelect = that.$().find('#neos-node-tree-filter select');
				$.when(ResourceCache.getItem(Configuration.get('NodeTypeSchemaUri') + '&superType=' + this.baseNodeType)).done(function(dataString) {
					var data = JSON.parse(dataString);
					$.each(data, function(key) {
						$neosNodeTypeSelect.append('<option value="' + key + '">' + this.ui.label + '</option>');
					});
					$neosNodeTypeSelect.chosen({disable_search_threshold: 10, allow_single_deselect: true});
				}).fail(function(xhr, status, error) {
					console.error('Error loading node types.', xhr, status, error);
				});

				// Type filter
				$neosNodeTypeSelect.change(function() {
					that.set('nodeType', $neosNodeTypeSelect.val());
					that.filterTree();
				});
			},

			onContextStructureModeChanged: function() {
				this.scrollToCurrentNode();
			}.observes('controller.contextStructureMode'),

			/**
			 * Initialize the dynatree instance stored at the DOM node
			 * this.$nodeTree
			 */
			_initializeTree: function() {
				if (this.$nodeTree) {
					return;
				}

				this.set('treeConfiguration', $.extend(true, this.get('treeConfiguration'), {
					parent: this,
					children: [
						{
							title: pageMetaInformation.data('__sitename'),
							key: this.siteRootNodePath,
							isFolder: true,
							expand: false,
							isLazy: true,
							select: false,
							active: false,
							unselectable: true,
							nodeType: 'unstructured',
							addClass: 'neos-matched',
							iconClass: 'icon-globe'
						}
					],

					onClick: function(node, event) {
						if (this.options.parent.get('editNodeTitleMode') === true) {
							return false;
						}
						// only if the node title was clicked
						// and it was not active at this time
						// it should be navigated to the target node
						if (node.data.key !== this.options.parent.get('siteRootNodePath') && (node.getEventTargetType(event) === 'title' || node.getEventTargetType(event) === null)) {
							var that = this;
							setTimeout(function() {
								if (!that.isDblClick) {
									ContentModule.loadPage(node.data.href);
								}
							}, 300);
						}

						event.preventDefault();
						return true;
					},

					onDblClick: function(node, event) {
						if (node.getEventTargetType(event) === 'title' && node.getLevel() !== 1) {
							this.isDblClick = true;
							var that = this;
							setTimeout(function() {
								that.isDblClick = false;
								that.options.parent.editNode(node);
							}, 300);
						}
					},

					onKeydown: function(node, event) {
						switch (event.which) {
							case 113: // [F2]
								this.options.parent.editNode(node);
								return false;
							case 69: // [e]
								this.options.parent.editNode(node);
								return false;
						}
					}
				}));

				this._super();

				this._initializePropertyObservers(pageMetaInformation);

				// Activate the current node in the tree if possible
				var pageTreeNode = this.getPageTreeNode();
				if (pageTreeNode) {
					pageTreeNode.activate();
					pageTreeNode.select();
				}

				var that = this;
				ContentModule.on('pageLoaded', function() {
					var pageNode = that.getPageTreeNode();
					if (pageNode) {
						pageNode.activate();
						pageNode.select();
						that.scrollToCurrentNode();
						// for in-page reloads we need to re-monitor the current page
						that._initializePropertyObservers($('#neos-page-metainformation'));
					}
				});

				// Handles click events when a page title is in edit mode so clicks on other pages leads not to reloads
				this.$nodeTree.click(function() {
					if (that.get('editNodeTitleMode') === true) {
						return false;
					}
					return true;
				});
			},

			getPageTreeNode: function() {
				if (this.$nodeTree && this.$nodeTree.children().length > 0) {
					return this.$nodeTree.dynatree('getTree').getNodeByKey($('#neos-page-metainformation').attr('about'));
				}
				return null;
			},

			editNode: function(node) {
				if (typeof node === 'undefined') {
					if (this.get('editNodeTitleMode') === true) {
						this.$().find('input#editNode').blur();
						return;
					}
					node = this.get('activeNode');
				}

				if (!node) {
					Notification.notice('You have to select a node');
				}

				// Skip editing site nodes
				if (node.getLevel() < 2) {
					Notification.notice('The Root node cannot be deleted.');
					return;
				}

				var croppedTitle = node.data.title,
					prevTitle = node.data.tooltip,
					tree = node.tree,
					that = this;

				that.set('editNodeTitleMode', true);
				tree.$widget.unbind();

				var input = $('<input />').attr({id: 'editNode', value: prevTitle});
				$('.neos-dynatree-title', node.span).html(input);

				// Focus <input> and bind keyboard handler
				input.focus().keydown(function(event) {
					switch (event.which) {
						case 27: // [esc]
							// discard changes on [esc]
							$('input#editNode').val(prevTitle);
							$(this).blur();
							break;
						case 13: // [enter]
							// simulate blur to accept new value
							$(this).blur();
							break;
					}
				}).blur(function() {
					//TODO please don't touch this part it is really fragile so this works in FF and chrome
					// Accept new value, when user leaves <input>
					var newTitle = input.val(),
						title;
					// Re-enable mouse and keyboard handling
					tree.$widget.bind();
					node.activate();

					if (prevTitle === newTitle || newTitle === '') {
						title = croppedTitle;
					} else {
						title = newTitle;
						node.setLazyNodeStatus(that.statusCodes.loading);
						TYPO3_Neos_Service_ExtDirect_V1_Controller_NodeController.update(
							{
								__contextNodePath: node.data.key,
								title: title
							},
							function(result) {
								if (result !== null && result.success === true) {
									var selectedNode = NodeSelection.get('selectedNode'),
										entity = vieInstance.entities.get(vieInstance.service('rdfa').getElementSubject(selectedNode.$element));
									if (entity) {
										entity.set('typo3:title', title);
									}
									if (node.data.key === selectedNode.$element.attr('about')) {
										InspectorController.set('nodeProperties.title', title);
										InspectorController.apply();
									}
									node.setLazyNodeStatus(that.statusCodes.ok);
								} else {
									Notification.error('Unexpected error while updating node: ' + JSON.stringify(result));
									node.setLazyNodeStatus(that.statusCodes.error);
								}
							}
						);
					}

					node.activate();
					input.parent().text(title);
					input.remove();
					setTimeout(function() {
						that.set('editNodeTitleMode', false);
					}, 50);
				});
			},

			createNode: function(activeNode, title, nodeType, iconClass) {
				var that = this,
					position = 'into';

				var node = activeNode.addChild({
						title: title,
						nodeType: nodeType,
						addClass: 'typo3_neos-page neos-matched',
						iconClass: iconClass,
						expand: false
					}),
					prevTitle = node.data.tooltip,
					tree = node.tree;

				if (position === 'into') {
					activeNode.expand(true);
				}

				that.set('editNodeTitleMode', true);
				tree.$widget.unbind();

				$('> .neos-dynatree-title', node.span).html($('<input />').attr({id: 'editCreatedNode', value: prevTitle}));
				// Focus <input> and bind keyboard handler
				$('input#editCreatedNode').focus().select().keydown(function(event) {
					switch (event.which) {
						case 27: // [esc]
							// discard changes on [esc]
							$('input#editNode').val(prevTitle);
							$(this).blur();
							break;
						case 13: // [enter]
							// simulate blur to accept new value
							$(this).blur();
							break;
					}
				}).blur(function(event) {
					//TODO please don't touch this part it is really fragile so this works in FF and chrome
					var newTitle = $('input#editCreatedNode').val(),
						title;

					// Accept new value, when user leaves <input>
					if (prevTitle === newTitle || newTitle === '') {
						title = prevTitle;
					} else {
						title = newTitle;
					}
					// Hack for Chrome and Safari, otherwise two pages will be created, because .blur fires one request with two datasets
					if (that.get('editNodeTitleMode') === true) {
						that.set('editNodeTitleMode', false);
						node.activate();
						node.setTitle(title);
						that.persistNode(activeNode, node, nodeType, position);
					}
				});
			},

			refresh: function() {
				this.filterTree();
			},

			/**
			 * Filter the tree
			 */
			filterTree: function() {
				var that = this,
					node = that.$nodeTree.dynatree('getRoot').getChildren()[0];
				node.removeChildren();
				node.setLazyNodeStatus(this.statusCodes.loading);

				if (this.get('searchTerm') === '' && this.get('nodeType') === '') {
					this.set('filtering', false);
					node._currentlySendingExtDirectAjaxRequest = false;
					this.loadNode(node, 4);
				} else {
					var filterQuery = Ember.generateGuid();
					that.set('latestFilterQuery', filterQuery);
					this.set('filtering', true);
					node._currentlySendingExtDirectAjaxRequest = true;
					TYPO3_Neos_Service_ExtDirect_V1_Controller_NodeController.filterChildNodesForTree(
						this.get('siteRootNodePath'),
						this.get('searchTerm'),
						this.get('nodeType'),
						function(result) {
							if (that.get('latestFilterQuery') === filterQuery) {
								node.removeChildren();
								node._currentlySendingExtDirectAjaxRequest = false;
								if (result !== null && result.success === true) {
									node.setLazyNodeStatus(that.statusCodes.ok);
									node.addChild(result.data);
								} else {
									node.setLazyNodeStatus(that.statusCodes.error);
									Notification.error('Node Tree loading error.');
								}
							}
						}
					);
				}
			}
		});
	}
);