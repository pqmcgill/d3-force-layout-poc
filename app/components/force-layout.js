import Ember from 'ember';

export default Ember.Component.extend({

    data: null,

    didInsertElement: function() {
        Ember.run.scheduleOnce('afterRender', this, function() {
            const WIDTH = 1000,
                HEIGHT = 1000;

            const data = this.get('data');
            const links = data.links;
            const nodes = data.nodes.map(node => ({ ...node, r: 10}));

            const color = d3.scaleOrdinal(d3.schemeCategory20);

            const svg = d3.select("svg#graph")
              .attr("width", WIDTH)
              .attr("height", HEIGHT)
              .on('click', clearContextMenu);

            const link = svg.append('g')
                .attr('class', 'links')
                .selectAll('line')
                .data(links)
                .enter().append('line')
                    .attr('stroke', '#000000')
                    .attr('stroke-width', 1);

            const node = svg.append('g')
                .attr('class', 'nodes')
                .selectAll('circle')
                .data(nodes)
                .enter().append('circle')
                    .attr('r', d => d.r)
                    .attr('fill', () => {
                        return '#ABABAB';
                    })
                    .on('click', nodeClicked);

            node.append('title')
                .text(d => d.id);

            const simulation = d3.forceSimulation()
                .force('link', d3.forceLink().id(d => d.id))
                .force('charge', d3.forceManyBody().strength(-80))
                .force('center', d3.forceCenter(WIDTH / 2, HEIGHT / 2));

            simulation
                .nodes(nodes)
                .on('tick', ticked.bind(null, link, node));

            simulation.force('link')
                .links(links);

            function nodeClicked(node) {
                // clean up
                clearContextMenu();

                // build context menu
                d3.select(this)
                    .attr('r', 30);

                const contextMenuData = [
                    { name: 'option1', action: 'clickOption1' },
                    { name: 'option2', action: 'clickOption2' },
                    { name: 'option3', action: 'clickOption3' },
                    { name: 'option4', action: 'clickOption4' }
                ];
                const contextMenu = d3.pie()
                    .value(1);

                const contextMenuPath = d3.arc()
                    .outerRadius(60)
                    .innerRadius(30);

                const arc = svg.append('g')
                    .attr('class', 'contextMenu')
                    .attr('transform', `translate(${node.x}, ${node.y})`)
                    .selectAll('.menuItem')
                        .data(contextMenu(contextMenuData))
                        .enter().append('g')
                            .attr('class', d => `menuItem ${d.data.name}`)
                            .on('click', d => {
                                clickedOption(d.data, node);
                            });

                arc.append('path')
                    .attr('class', 'path')
                    .attr('d', contextMenuPath)

                d3.event.stopPropagation();
            }

            function ticked(link, node) {
                link
                    .attr('x1', d => d.source.x)
                    .attr('y1', d => d.source.y)
                    .attr('x2', d => d.target.x)
                    .attr('y2', d => d.target.y);

                node
                    .attr('cx', d => d.x)
                    .attr('cy', d => d.y);
            };

            function clearContextMenu() {
                d3.selectAll('circle')
                    .attr('r', 10);
                d3.selectAll('.contextMenu')
                    .remove();
            }

            const clickedOption = (menuOption, node) => {
                this.sendAction(menuOption.action, node);
                d3.event.stopPropagation();
            };

        });
    }
});
