import { Component, EventEmitter, Output } from '@angular/core';

@Component({
    selector: 'ap-drawer',
    templateUrl: './drawer.component.html',
    styleUrls: ['./drawer.component.css'],
    standalone: false,
})
export class DrawerComponent {
    @Output() openCommandBarClick = new EventEmitter();

    openCommandBar() {
        this.openCommandBarClick.emit();
    }
}
