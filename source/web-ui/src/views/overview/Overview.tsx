// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import React from 'react';
import './Overview.css';
import { API, graphqlOperation, I18n } from 'aws-amplify';
import { IMachineReferenceDataItem, IMessageFormatConfigItem, IUIReferenceMappingItem, ILocationReferenceDataItem, ILineReferenceDataItem, ReferenceDataTypes, IReferenceDataItem, ConfigType } from '../../util/data-structures';
import { getConfigItem, IGetConfigItemResponse } from '../../graphql/queries';
import { updateMachineGrouping } from '../../graphql/mutations';
import { LargeNotification } from '../shared/LargeNotification';
import { MachineStatusCard } from '../machines/MachineStatusCard';
import { LineRow } from '../lines/LineRow';
import DropdownButton from 'react-bootstrap/DropdownButton';
import Dropdown from 'react-bootstrap/Dropdown'
import Container from 'react-bootstrap/Container';
import Row from 'react-bootstrap/Row';
import Col from 'react-bootstrap/Col';
import Spinner from 'react-bootstrap/Spinner';
import Modal from 'react-bootstrap/Modal';
import Button from 'react-bootstrap/Button';

import { getUIReferenceItems, IGetUIReferenceItemsResponse } from '../../graphql/queries';
import { onUpdateUIReferenceItem, IOnUpdateUIReferenceItemResponse } from '../../graphql/subscriptions';
import { Form } from 'react-bootstrap';

type OverviewProps = {
    selectedLocationStorageKeyName: string;
};

type OverviewState = {
    locations: ILocationReferenceDataItem[];
    lines: ILineReferenceDataItem[];
    machines: IMachineReferenceDataItem[];
    uiReferenceMapping?: IUIReferenceMappingItem;
    isLoading: boolean;
    isMutating: boolean;
    showConfigModal: boolean;
    machineIdDelimiter: string;
    newLocationUIReferenceMapping: Set<string>;
    newLineUIReferenceMapping: Set<string>;
};

export class Overview extends React.Component<OverviewProps, OverviewState> {
    private _isMounted = false;
    private _selectedLocationStorageKeyName: string;
    private UNASSIGNED_MACHINES_LOCATION_ID = 'UNASSIGNED_MACHINES_LOCATION_ID';
    private UNASSIGNED_MACHINES_LOCATION_NAME = 'Unassigned Machines';
    private referenceDataUpdatedSubscription: any;

    constructor(props: OverviewProps) {
        super(props);
        this._selectedLocationStorageKeyName = props.selectedLocationStorageKeyName;
        this.state = {
            isLoading: false,
            isMutating: false,
            showConfigModal: false,
            machines: [],
            locations: [],
            lines: [],
            machineIdDelimiter: '/',
            newLocationUIReferenceMapping: new Set(),
            newLineUIReferenceMapping: new Set()
        };
        this.onLocationSelect = this.onLocationSelect.bind(this);
        this.onClickConfig = this.onClickConfig.bind(this);
        this.onCloseConfigModal = this.onCloseConfigModal.bind(this);
        this.onChangeUIRefeferenceMapping = this.onChangeUIRefeferenceMapping.bind(this);
        this.onUpdateUIReferenceMapping = this.onUpdateUIReferenceMapping.bind(this);
    }

    async componentDidMount() {
        this._isMounted = true;
        await this.getReferenceData();
        await this.getMessageFormatConfigItem();

        // Retrieve the last selected location and set that to be the current selected location
        try {
            const selectedLocationId = window.localStorage.getItem(this._selectedLocationStorageKeyName);
            if (selectedLocationId) {
                this.onLocationSelect(selectedLocationId);
            }
        } catch (err) {
            console.error(err);
        }

        // @ts-ignore
        this.referenceDataUpdatedSubscription = API.graphql(graphqlOperation(onUpdateUIReferenceItem)).subscribe({
            next: (response: IOnUpdateUIReferenceItemResponse) => this.handleUpdatedReferenceData(response.value.data.onUpdateUIReferenceItem),
            error: (err: any) => {
                // If there's an error (e.g. connection closed), reload the window.
                console.error('Subscription error', err);
                window.location.reload();
            }
        });
    }

    componentWillUnmount() {
        this._isMounted = false;
        if (this.referenceDataUpdatedSubscription) {
            this.referenceDataUpdatedSubscription.unsubscribe();
        }
    }

    async getReferenceData() {
        if (!this._isMounted) { return; }

        this.setState({ isLoading: true });

        const resp = (await API.graphql({ query: getUIReferenceItems }) as IGetUIReferenceItemsResponse);

        for (const referenceDataItem of resp.data.getUIReferenceItems) {
            this.handleUpdatedReferenceData(referenceDataItem);
        }

        this.checkSelectedLocation();
        this.setState({ isLoading: false });
    }

    async getMessageFormatConfigItem() {
        if (!this._isMounted) { return; }

        this.setState({ isLoading: true });

        const resp = (await API.graphql({
            query: getConfigItem,
            variables: {
                input: {
                    id: 'DEFAULT',
                    type: ConfigType.MESSAGE_FORMAT
                }
            }
        }) as IGetConfigItemResponse);

        const msgFormatConfigItem = resp.data.getConfigItem as IMessageFormatConfigItem;
        this.setState({ isLoading: false, machineIdDelimiter: msgFormatConfigItem.msgFormatDataAliasDelimiter });
    }

    checkSelectedLocation() {
        // Set the selected location to the first location by default
        if (this.state.locations.length > 0 && !this.state.locations.some(loc => loc.isSelected)) {
            this.onLocationSelect(this.state.locations[0].id);
        }
    }

    handleUpdatedReferenceData(newRefData: IReferenceDataItem) {
        if (!this._isMounted) { return; }
        switch (newRefData.type) {
            case ReferenceDataTypes.LOCATION:
                this.addLocation(newRefData as ILocationReferenceDataItem);
                break;
            case ReferenceDataTypes.LINE:
                this.addLine(newRefData as ILineReferenceDataItem);
                break;
            case ReferenceDataTypes.MACHINE:
                this.addMachine(newRefData as IMachineReferenceDataItem);
                break;
            case ReferenceDataTypes.UI_REFERENCE_MAPPING:
                this.addUIReferenceMapping(newRefData as IUIReferenceMappingItem);
                break;
        }

        // Check if there are any machines not assigned to a location
        const machines = this.state.machines;
        const locations = this.state.locations;
        if (machines.some(machine => !machine.locationId)) {
            // Check if the list of locations has an item for unassigned machines. If not, create one
            if (!locations.some(loc => loc.id === this.UNASSIGNED_MACHINES_LOCATION_ID)) {
                locations.unshift({
                    id: this.UNASSIGNED_MACHINES_LOCATION_ID,
                    type: ReferenceDataTypes.LOCATION,
                    name: this.UNASSIGNED_MACHINES_LOCATION_NAME,
                    // Only select the location for unassigned machines if there is no previous location selected
                    isSelected: locations.find(loc => loc.isSelected) ? false : true
                });
            }
        }

        this.setState({ ...this.state, locations, machines });
    }

    addLocation(newLocation: ILocationReferenceDataItem) {
        if (!this._isMounted) { return; }
        const locations = this.state.locations;
        const matchingLocationIdx = locations.findIndex(loc => loc.id === newLocation.id);

        let isSelected = (locations.length === 0);
        if (matchingLocationIdx > -1) {
            // Remove the previous location from the array
            const previousLocation = locations.splice(matchingLocationIdx, 1);
            isSelected = previousLocation[0].isSelected;
        }

        locations.push({ ...newLocation, isSelected });
        locations.sort(this.sortByNameOrId);

        this.setState({ ...this.state, locations });
    }

    addLine(newLine: ILineReferenceDataItem) {
        if (!this._isMounted) { return; }
        const lines = this.state.lines;
        const matchingLineIdx = lines.findIndex(line => line.id === newLine.id);

        if (matchingLineIdx > -1) {
            // Remove the previous line from the array
            lines.splice(matchingLineIdx, 1);
        }

        lines.push(newLine);
        lines.sort(this.sortByNameOrId);
        this.setState({ ...this.state, lines });
    }

    addMachine(newMachine: IMachineReferenceDataItem) {
        if (!this._isMounted) { return; }
        const machines = this.state.machines;
        const matchingMachineIdx = machines.findIndex(machine => machine.id === newMachine.id);

        if (matchingMachineIdx > -1) {
            machines.splice(matchingMachineIdx, 1);
        }

        if (this.state.uiReferenceMapping) {
            const delim = this.state.machineIdDelimiter;
            const splitMachineAlias = newMachine.id.split(delim);

            const splitLocationKeys = this.state.uiReferenceMapping.uiReferenceMappingLocationKeys
                .split(delim)
                .map(key => parseInt(key, 10));

            const locationId = splitLocationKeys
                .map(idx => splitMachineAlias[idx])
                .join(delim);

            const splitLineKeys = this.state.uiReferenceMapping.uiReferenceMappingLineKeys
                .split(delim)
                .map(key => parseInt(key, 10));

            const lineId = splitLineKeys
                .map(idx => splitMachineAlias[idx])
                .join(delim);

            if (locationId) {
                this.addLocation({ id: locationId, type: ReferenceDataTypes.LOCATION, isSelected: false });
            }
            this.addLine({ id: lineId, type: ReferenceDataTypes.LINE, locationId });

            newMachine.locationId = locationId;
            newMachine.lineId = lineId;
        }

        machines.push(newMachine);
        machines.sort(this.sortByNameOrId);
        this.setState({ ...this.state, machines });
    }

    addUIReferenceMapping(uiReferenceMapping: IUIReferenceMappingItem): void {
        if (!this._isMounted) { return; }
        // Create a temporary copy of the machines array as we will be modifying the state
        // while iterating over each machine
        const machines = this.state.machines.slice();
        this.setState({ uiReferenceMapping, locations: [], lines: [] });

        // Setting the machine again will recreate all locations and lines
        machines.forEach(machine => {
            this.addMachine({
                id: machine.id,
                type: ReferenceDataTypes.MACHINE,
                machineStatus: machine.machineStatus,
                machineStatusUpdatedTimestamp: machine.machineStatusUpdatedTimestamp,
                name: machine.name
            });
        });
    }

    onLocationSelect(selectedLocationId: string) {
        if (!this._isMounted) { return; }
        const locations = this.state.locations;

        // Set the location only if the selectedLocationId matches one of the locations
        if (locations.find(loc => loc.id === selectedLocationId)) {
            locations.forEach(loc => loc.isSelected = (loc.id === selectedLocationId));
            window.localStorage.setItem(this._selectedLocationStorageKeyName, selectedLocationId);
            this.setState({ locations });
        }
    }

    sortByNameOrId(a: IReferenceDataItem, b: IReferenceDataItem) {
        if (a.name && b.name) {
            return a.name.localeCompare(b.name);
        } else {
            return a.id.localeCompare(b.id);
        }
    }

    loadingIndicator() {
        return (<Spinner animation="border" variant="info" />);
    }

    showLineHeader(willDisplayLines: boolean) {
        if (!willDisplayLines) { return null; }

        return (
            <Row key="line-header-row">
                <Container fluid key="line-header-row-container">
                    <Row key="line-header-line-label-row">
                        <Col xs lg="2" key="line-header-line-label-col" className="card-title h5">{`${I18n.get('legend.lines')}`}:</Col>
                        <Col xs="auto" md="auto" lg="auto" xl="auto" key="line-header-machines-label-col" className="card-title h5 line-header-machines-label">
                            {`${I18n.get('legend.machines')}`}:
                        </Col>
                    </Row>
                </Container>
            </Row>
        );
    }

    showMachines() {
        if (!this.state.machines || this.state.machines.length === 0) {
            return (<LargeNotification key="no-machines-notification" displayText={`${I18n.get('notification.noMachines')}`}></LargeNotification>);
        }

        const selectedLocation = this.state.locations.find(loc => loc.isSelected);
        if (!selectedLocation) {
            return (<LargeNotification key="error-notification" displayText={`${I18n.get('notification.error')}`}></LargeNotification>);
        }

        const machinesInLines: { [key: string]: IMachineReferenceDataItem[] } = {};
        const unassignedMachines: IMachineReferenceDataItem[] = [];

        this.state.machines
            .filter(machine => {
                if ((selectedLocation.id === this.UNASSIGNED_MACHINES_LOCATION_ID && !machine.locationId) ||
                    (machine.locationId === selectedLocation.id)) {
                    return true;
                }

                return false;
            })
            .forEach(machine => {
                if (machine.lineId) {
                    if (!machinesInLines[machine.lineId]) {
                        machinesInLines[machine.lineId] = [];
                    }

                    machinesInLines[machine.lineId].push(machine);
                } else {
                    unassignedMachines.push(machine);
                }
            });

        return (
            <>
                {this.showLineHeader(Object.keys(machinesInLines).length > 0)}
                {Object.keys(machinesInLines).map(
                    (lineId) => (
                        <Row className="machine-container-row" key={`machine-container-row-${lineId}`}>
                            <LineRow key={`machine-container-line-${selectedLocation.id}`} locationId={selectedLocation.id} line={this.state.lines.find(line => line.id === lineId)} machines={machinesInLines[lineId]}></LineRow>
                        </Row>
                    ))}

                <Container fluid key="unassigned-machines-container" className="unassigned-machines-row-container">
                    <Row className="machine-container-row" key='unassigned-machines-row'>
                        {unassignedMachines.map(
                            (machine) => (
                                <MachineStatusCard key={`machine-status-card-${machine.id}`} machine={machine}></MachineStatusCard>
                            ))}
                    </Row>
                </Container>
            </>
        );
    }

    async onClickConfig() {
        if (!this._isMounted) { return; }
        const locationSelection = new Set<string>();
        const lineSelection = new Set<string>();

        if (this.state.uiReferenceMapping) {
            // Retrieve the current configuration from the state
            const delim = this.state.machineIdDelimiter;
            this.state.uiReferenceMapping.uiReferenceMappingLocationKeys
                .split(delim)
                .forEach(key => locationSelection.add(key));

            this.state.uiReferenceMapping.uiReferenceMappingLineKeys
                .split(delim)
                .forEach(key => lineSelection.add(key));
        }

        this.setState({ showConfigModal: true, newLineUIReferenceMapping: lineSelection, newLocationUIReferenceMapping: locationSelection });
    }

    onCloseConfigModal() {
        if (!this._isMounted) { return; }
        this.setState({ showConfigModal: false });
    }

    showModalBody() {
        if (!this.state.machines || this.state.machines.length === 0) {
            return null;
        }

        const delim = this.state.machineIdDelimiter;
        const sampleMachineId = this.state.machines[0].id;
        const sampleMachineIdTokens = sampleMachineId.split(delim);
        sampleMachineIdTokens.pop(); // Remove the machine name

        return (
            <Modal.Body key="config-machine-modal-body">
                <Row key="config-machine-grouping-modal-sample-row" className="config-machine-grouping-modal-sample-row">
                    <Col key="config-machine-grouping-modal-sample-col">
                        {`${I18n.get('modal.configGrouping.sampleMachineLabel')}`}: {sampleMachineId}
                    </Col>
                </Row>
                <Row key="config-machine-grouping-modal-location-row">
                    <Col key="config-machine-grouping-modal-location-select-col">
                        <Form.Group controlId="locationSelections">
                            <Form.Label><strong className="machine-config-label">{`${I18n.get('modal.configGrouping.machineLocationSelectionLabel')}`}</strong></Form.Label>
                            {Object.keys(sampleMachineIdTokens).map(idx => (
                                <Form.Check className="grouping-select-checkbox" checked={this.state.newLocationUIReferenceMapping.has(idx)} disabled={this.state.isMutating} onChange={this.onChangeUIRefeferenceMapping} type="checkbox" id={`location-${idx}`} key={`location-check-${idx}`} label={sampleMachineIdTokens[parseInt(idx, 10)]} />
                            ))}
                        </Form.Group>
                    </Col>
                </Row>
                <Row key="config-machine-grouping-modal-line-row">
                    <Col key="config-machine-grouping-modal-line-select-col">
                        <Form.Group controlId="lineSelections">
                            <Form.Label><strong className="machine-config-label">{`${I18n.get('modal.configGrouping.machineLineSelectionLabel')}`}</strong></Form.Label>
                            {Object.keys(sampleMachineIdTokens).map(idx => (
                                <Form.Check className="grouping-select-checkbox" checked={this.state.newLineUIReferenceMapping.has(idx)} disabled={this.state.isMutating} onChange={this.onChangeUIRefeferenceMapping} type="checkbox" id={`line-${idx}`} key={`line-check-${idx}`} label={sampleMachineIdTokens[parseInt(idx, 10)]} />
                            ))}
                        </Form.Group>
                    </Col>
                </Row>
                <Row key="config-machine-grouping-modal-location-preview-row">
                    <Col key="config-machine-grouping-modal-location-preview-col" md="5" lg="5" xl="5">
                        <strong className="machine-config-label">{`${I18n.get('modal.configGrouping.locationPreviewLabel')}`}:</strong>
                    </Col>
                    <Col key="config-machine-grouping-modal-location-preview-value-col">
                        {Array.from(this.state.newLocationUIReferenceMapping)
                            .map(key => (sampleMachineIdTokens[parseInt(key, 10)]))
                            .join(delim)}
                    </Col>
                </Row>
                <Row key="config-machine-grouping-modal-line-preview-row">
                    <Col key="config-machine-grouping-modal-line-preview-col" md="5" lg="5" xl="5">
                        <strong className="machine-config-label">{`${I18n.get('modal.configGrouping.linePreviewLabel')}`}:</strong>
                    </Col>
                    <Col key="config-machine-grouping-modal-line-preview-value-col">
                        {Array.from(this.state.newLineUIReferenceMapping)
                            .map(key => (sampleMachineIdTokens[parseInt(key, 10)]))
                            .join(delim)}
                    </Col>
                </Row>
            </Modal.Body>);
    }

    onChangeUIRefeferenceMapping(event: any) {
        if (!this._isMounted) { return; }
        const checkboxTarget = event.currentTarget;
        const checkboxId = checkboxTarget.id;
        const checkboxType = checkboxId.split('-')[0];
        const checkboxValue = checkboxId.split('-')[1];

        if (checkboxType === 'line') {
            const lineKeys = this.state.newLineUIReferenceMapping;
            if (checkboxTarget.checked) {
                if (this.state.newLocationUIReferenceMapping.has(checkboxValue)) {
                    alert('This already selected as part of the Location grouping');
                    checkboxTarget.checked = false;
                } else {
                    lineKeys.add(checkboxValue);
                }
            } else {
                lineKeys.delete(checkboxValue);
            }

            lineKeys.delete('');
            this.setState({ newLineUIReferenceMapping: lineKeys });
        } else if (checkboxType === 'location') {
            const locationKeys = this.state.newLocationUIReferenceMapping;
            if (checkboxTarget.checked) {
                if (this.state.newLineUIReferenceMapping.has(checkboxValue)) {
                    alert('This already selected as part of the Line grouping');
                    checkboxTarget.checked = false;
                } else {
                    locationKeys.add(checkboxValue);
                }
            } else {
                locationKeys.delete(checkboxValue);
            }

            locationKeys.delete('');
            this.setState({ newLocationUIReferenceMapping: locationKeys });
        }
    }

    async onUpdateUIReferenceMapping() {
        if (!this._isMounted) { return; }
        this.setState({ isMutating: true });

        await API.graphql({
            query: updateMachineGrouping, variables: {
                input: {
                    uiReferenceMappingLocationKeys: Array.from(this.state.newLocationUIReferenceMapping).join(this.state.machineIdDelimiter),
                    uiReferenceMappingLineKeys: Array.from(this.state.newLineUIReferenceMapping).join(this.state.machineIdDelimiter)
                }
            }
        });

        this.setState({ isMutating: false, showConfigModal: false });
    }

    render() {
        if (this.state.isLoading) {
            return this.loadingIndicator();
        }

        const selectedLocation = this.state.locations.find(loc => loc.isSelected);
        if (!selectedLocation) {
            return (<LargeNotification key="no-machines-notification" displayText={`${I18n.get('notification.noMachines')}`}></LargeNotification>);
        }

        let configBtn = null;
        if (this.state.machines && this.state.machines.length > 0) {
            configBtn = (<button key="configure-grouping-btn" onClick={this.onClickConfig} className="configure-grouping-button">
                <i className="configure-grouping-icon bi-gear"></i>
            </button>
            );
        }

        return (
            <>
                <Container fluid key="overview-container">
                    <Row key="location-select-row">
                        <Col key="location-label-col" md="auto" lg="auto" xl="auto"><div className="card-title h5 location-label">{`${I18n.get('legend.location')}`}:&nbsp;</div></Col>
                        <Col key="location-select-col" className="location-select-col">
                            <DropdownButton key="location-select-button" id="location-select-button" title={selectedLocation.name ? selectedLocation.name : selectedLocation.id} onSelect={(eventKey) => this.onLocationSelect(eventKey || '')}>
                                {this.state.locations.map(
                                    (location) => (
                                        <Dropdown.Item active={location.isSelected} key={`location-${location.id}`} eventKey={location.id}>{location.name || location.id}</Dropdown.Item>
                                    )
                                )}
                            </DropdownButton>
                            {configBtn}
                        </Col>
                    </Row>
                    {this.showMachines()}
                </Container>
                <Modal key="config-machine-grouping-modal" show={this.state.showConfigModal} onHide={this.onCloseConfigModal} centered animation={false}>
                    <Modal.Header key="config-machine-grouping-modal-header">
                        <strong>{`${I18n.get('modal.configGrouping.header')}`}</strong>
                    </Modal.Header>
                    {this.showModalBody()}
                    <Modal.Footer key="config-machine-grouping-modal-footer">
                        <Button variant="secondary" disabled={this.state.isMutating} onClick={this.onCloseConfigModal}>
                            {this.state.isMutating ? I18n.get('button.updating') : I18n.get('button.cancel')}
                        </Button>
                        <Button variant="success" disabled={this.state.isMutating} onClick={this.onUpdateUIReferenceMapping}>
                            {this.state.isMutating ? I18n.get('button.updating') : I18n.get('button.save')}
                        </Button>
                    </Modal.Footer>
                </Modal>
            </>
        );
    }
}
